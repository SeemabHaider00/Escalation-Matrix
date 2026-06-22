import express from "express";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import csvParser from "csv-parser";
import ExcelJS from "exceljs";

const upload = multer({ dest: os.tmpdir() });
export const etlRouter = express.Router();

// Store active ingestion jobs in memory
interface JobData {
    id: string;
    filePath: string;
    fileType: 'csv' | 'xlsx';
    totalRows: number;
    processedRows: number;
    headers: string[];
    stats: any; // Add your aggregated stats here
}

const jobs: Record<string, JobData> = {};

etlRouter.get("/export/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = jobs[jobId];
    if (!job) {
        return res.status(404).json({ error: "Job not found or expired." });
    }

    // Stream download original format or parsed format
    res.setHeader("Content-Disposition", `attachment; filename="export_${jobId}"`);
    if (job.fileType === 'csv') {
       res.setHeader("Content-Type", "text/csv");
    } else {
       res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    
    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);
});

export function computeAgeText(ms: number, formatMode: "days-hours" | "total-hours" = "days-hours"): string {
  if (ms < 0 || isNaN(ms)) {
    return formatMode === "days-hours" ? "0 days 0 hours" : "0 hours";
  }
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  if (formatMode === "total-hours") {
    return `${totalHours} hours`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} days ${hours} hours`;
}

// 1. Upload and detect headers
etlRouter.post("/upload-init", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileName = file.originalname.toLowerCase();
        const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
        const isCsv = fileName.endsWith(".csv");

        if (!isExcel && !isCsv) {
             return res.status(400).json({ error: "Unsupported file format." });
        }

        const jobId = file.filename;
        const filePath = file.path;

        let headers: string[] = [];
        let sampleRows: any[] = [];
        
        if (isCsv) {
            await new Promise<void>((resolve, reject) => {
                let rowCount = 0;
                fs.createReadStream(filePath)
                  .pipe(csvParser())
                  .on('headers', (hdr) => {
                      headers = hdr;
                  })
                  .on('data', (data) => {
                      if (rowCount < 100) {
                          sampleRows.push(data);
                      }
                      rowCount++;
                  })
                  .on('end', () => resolve())
                  .on('error', reject);
            });
            // Total rows not known for CSV until we scan it fully. Just estimate or skip validation
        } else if (isExcel) {
            try {
                const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
                    worksheets: "emit",
                    sharedStrings: "cache"
                });

                let rowCount = 0;
                for await (const worksheetReader of workbook) {
                    for await (const row of worksheetReader) {
                        rowCount++;
                        const values = Array.isArray(row.values) ? row.values.slice(1) : []; 
                        if (rowCount === 1) {
                            headers = values.map((v: any) => v?.toString() || "");
                        } else if (rowCount <= 101) {
                            const obj: Record<string, string> = {};
                            headers.forEach((h, i) => {
                                obj[h] = values[i]?.toString() || "";
                            });
                            sampleRows.push(obj);
                        }
                    }
                    break; // only read first sheet
                }
            } catch (err) {
                console.error("Excel parse error:", err);
                return res.status(500).json({ error: "Unable to parse uploaded Excel file." });
            }
        }

        // Detect default mapping
        let tsMatch = "";
        let msgMatch = "";
        headers.forEach((hdr) => {
            const l = hdr.toLowerCase().replace(/[\s_-]/g, "");
            if (l === "statusstarttime") tsMatch = hdr;
            else if (!tsMatch && (l.includes("statusstart") || l.includes("start") || l.includes("time") || l.includes("date") || l.includes("timestamp"))) tsMatch = hdr;
            if (!msgMatch && (l.includes("msg") || l.includes("note") || l.includes("body") || l.includes("message"))) msgMatch = hdr;
        });
        
        const exactTimeMatch = headers.find(h => h.toLowerCase().replace(/[\s_-]/g, "") === "statusstarttime");

        jobs[jobId] = {
            id: jobId,
            filePath,
            fileType: isExcel ? 'xlsx' : 'csv',
            totalRows: 0,
            processedRows: 0,
            headers,
            stats: { validCount: 0, corruptedCount: 0, minAgeMs: Infinity, maxAgeMs: -Infinity, sumAgeMs: 0, previewPool: [] }
        };

        res.json({
            jobId,
            headers,
            sampleRows,
            detectedTsCol: exactTimeMatch || tsMatch || headers[0] || "",
            detectedMsgCol: msgMatch || ""
        });

    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: "Internal server error reading file headers." });
    }
});

// 2. Process File Chunk
etlRouter.post("/process-chunk", async (req, res) => {
    const { jobId, tsCol, msgCol, batchSize = 5000 } = req.body;
    const job = jobs[jobId];
    if (!job) {
        return res.status(404).json({ error: "Job not found." });
    }

    const { filePath, fileType } = job;
    const nowMs = Date.now();
    let rowsProcessedThisChunk = 0;
    
    // We will build a streaming state that skips `job.processedRows`
    let isEOF = false;

    if (fileType === 'csv') {
        await new Promise<void>((resolve, reject) => {
            let rowCount = 0;
            const stream = fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('data', (data) => {
                    const idx = rowCount++;
                    if (idx < job.processedRows) return; // Skip already processed
                    
                    if (rowsProcessedThisChunk >= batchSize) {
                        stream.destroy();
                        resolve();
                        return;
                    }
                    
                    processRowForStats(data, tsCol, msgCol, nowMs, job);
                    rowsProcessedThisChunk++;
                })
                .on('end', () => {
                    isEOF = true;
                    resolve();
                })
                .on('error', reject);
        });
    } else {
        // stream Excel
        try {
            const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
                worksheets: "emit",
                sharedStrings: "cache"
            });
            let rowCount = 0;
            let hitLimit = false;

            for await (const worksheetReader of workbook) {
                for await (const row of worksheetReader) {
                    if (rowCount === 0) {
                        // Header row bypass
                        rowCount++;
                        continue;
                    }

                    const dataIndex = rowCount - 1; // 0-indexed data rows
                    if (dataIndex < job.processedRows) {
                        rowCount++;
                        continue;
                    }
                    
                    if (rowsProcessedThisChunk >= batchSize) {
                        hitLimit = true;
                        break;
                    }

                    // Convert array row to object mapped by headers
                    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
                    const rowObj: Record<string, any> = {};
                    job.headers.forEach((h, i) => {
                        rowObj[h] = values[i]?.toString() || "";
                    });
                    
                    processRowForStats(rowObj, tsCol, msgCol, nowMs, job);
                    rowsProcessedThisChunk++;
                    rowCount++;
                }
                if (hitLimit) break;
            }
            if (!hitLimit) isEOF = true;

        } catch (err) {
            console.error("Excel stream error:", err);
            return res.status(500).json({ error: "Unable to process Excel file." });
        }
    }

    job.processedRows += rowsProcessedThisChunk;

    // We will delete the file later (after 1 hour timeout) instead of immediately 
    // so the backend can generate export dynamically
    if (isEOF && !job.stats.filePreservedForExport) {
        job.stats.filePreservedForExport = true;
        setTimeout(() => fs.unlink(filePath, () => {}), 3600000);
    }

    res.json({
        processedRows: job.processedRows,
        isEOF,
        stats: isEOF ? buildFinalStats(job) : null
    });
});

function processRowForStats(rowObj: Record<string, any>, tsCol: string, msgCol: string, nowMs: number, job: JobData) {
    const rawTimestamp = rowObj[tsCol] || "";
    const msgValue = rowObj[msgCol] || "";

    if (!rawTimestamp) {
      job.stats.corruptedCount++;
      return;
    }

    const timestampObj = new Date(rawTimestamp);
    if (isNaN(timestampObj.getTime())) {
      job.stats.corruptedCount++;
      return;
    }

    job.stats.validCount++;
    const recMs = timestampObj.getTime();
    let ageMs = nowMs - recMs;
    if (ageMs < 0) ageMs = 0;

    if (ageMs < job.stats.minAgeMs) {
      job.stats.minAgeMs = ageMs;
      job.stats.newestTimestamp = String(rawTimestamp);
    }
    if (ageMs > job.stats.maxAgeMs) {
      job.stats.maxAgeMs = ageMs;
      job.stats.oldestTimestamp = String(rawTimestamp);
    }
    job.stats.sumAgeMs += ageMs;

    if (job.stats.previewPool.length < 100) {
      const rawData = job.headers.map((hdr) => String(rowObj[hdr] || ""));
      job.stats.previewPool.push({
        timestamp: String(rawTimestamp),
        ageText: computeAgeText(ageMs),
        ageMs: ageMs,
        message: String(msgValue),
        rawData: rawData
      });
    }
}

function buildFinalStats(job: JobData) {
    const s = job.stats;
    return {
        totalCount: s.validCount + s.corruptedCount,
        validCount: s.validCount,
        corruptedCount: s.corruptedCount,
        minAgeMs: isFinite(s.minAgeMs) ? s.minAgeMs : 0,
        maxAgeMs: isFinite(s.maxAgeMs) ? s.maxAgeMs : 0,
        sumAgeMs: s.sumAgeMs,
        oldestTimestamp: s.oldestTimestamp || "",
        newestTimestamp: s.newestTimestamp || "",
        previewRows: s.previewPool
    };
}
