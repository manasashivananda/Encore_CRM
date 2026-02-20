const sql = require('mssql');
const OrderMaster = require("../models/ordermasterModel");
const config = require('../config/sqlConfig');

// Machine name mapping from database format to display format
const machineNameMap = {
    'SWI-2361\\SWI': 'SWI-PRO-2361-ENCORE',
    'SWI-1565\\SWI': 'SWI-PRO-1565-ENCORE-SHEETMETAL',
    // Add more mappings as needed
};

function mapMachineName(dbName) {
    if (!dbName) return 'Unknown';
    
    // Check direct mapping first
    if (machineNameMap[dbName]) {
        return machineNameMap[dbName];
    }
    
    // Try partial matching
    for (const [key, value] of Object.entries(machineNameMap)) {
        if (dbName.includes(key) || dbName.toUpperCase().includes(key.toUpperCase())) {
            return value;
        }
    }
    
    return dbName;
}

async function getJobsFromDatabase() {
    try {
        await sql.connect(config);

        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                JobName as order_no,
                SUM(Quantity) as total_pieces,
                SUM(CASE 
                    WHEN CAST(Folded AS DATE) = CAST(GETDATE() AS DATE) 
                    THEN ISNULL(QtyFolded, 0) 
                    ELSE 0 
                END) as folded_pieces,
                MAX(FoldedBy) as folded_by,
                FORMAT(MIN(CUT), 'yyyy-MM-dd HH:mm:ss') as start_timestamp,
                FORMAT(MAX(CASE 
                    WHEN CAST(Folded AS DATE) = CAST(GETDATE() AS DATE) 
                    THEN Folded 
                    ELSE NULL 
                END), 'yyyy-MM-dd HH:mm:ss') as end_timestamp,
                MAX(CASE 
                    WHEN CAST(Folded AS DATE) = CAST(GETDATE() AS DATE)
                    THEN Folded 
                    ELSE NULL 
                END) as folded_time_raw
            FROM [SWI].[dbo].[Jobs]
            WHERE JobName IS NOT NULL 
                AND JobName != ''
                AND Quantity > 0
            GROUP BY JobName
            ORDER BY MIN(EnteredDate) DESC
        `);

        const inProgress = [];
        const completed = [];

        // Get all orders which have remake orders
        let remakeOrders = await OrderMaster.find({ order_remake_checker: true,  }).select('order_unique_id').lean();
        result.recordset.forEach((job, index) => {
            const totalPieces = job.total_pieces || 0;
            const foldedPieces = job.folded_pieces || 0;

            // Skip jobs that haven't started folding yet (done_pieces == 0)
            if (foldedPieces === 0) {
                return;
            }

            // Completed: All pieces are folded (QtyFolded >= Quantity)
            // In Progress: Some pieces folded but not all
            const isCompleted = foldedPieces >= totalPieces && totalPieces > 0;

            const jobData = {
                id: index + 1,
                order_no: job.order_no,
                total_pieces: totalPieces,
                done_pieces: foldedPieces,
                status: isCompleted ? 'Completed' : 'In Progress',
                active: false,
                machine_name: mapMachineName(job.folded_by),
                start_timestamp: job.start_timestamp,
                end_timestamp: isCompleted ? job.end_timestamp : null,
                last_folded_time: job.folded_time_raw ? new Date(job.folded_time_raw).getTime() : 0,
                remake: remakeOrders.some(ro => ro.order_unique_id === job.order_no),
            };

            if (isCompleted) {
                completed.push(jobData);
            } else {
                inProgress.push(jobData);
            }
        });

        // Sort completed by end_timestamp (most recent first)
        completed.sort((a, b) => {
            return a.end_timestamp?.localeCompare(b.end_timestamp) || 0;
        });

        // Sort in-progress by start_timestamp
        inProgress.sort((a, b) => {
            return a.start_timestamp?.localeCompare(b.start_timestamp) || 0;
        });

        if (inProgress.length > 0) {
            // Group jobs by machine_name and find the one with most recent folded_time per machine
            const machineLatestJob = {};
            
            inProgress.forEach((job, index) => {
                const machineName = job.machine_name;
                
                if (!machineLatestJob[machineName]) {
                    machineLatestJob[machineName] = { index, time: job.last_folded_time };
                } else if (job.last_folded_time > machineLatestJob[machineName].time) {
                    machineLatestJob[machineName] = { index, time: job.last_folded_time };
                }
            });

            // Mark the most recent job for each machine as active
            Object.values(machineLatestJob).forEach(({ index }) => {
                inProgress[index].active = true;
            });
        }

        // Remove the temporary last_folded_time field from output
        inProgress.forEach(job => delete job.last_folded_time);
        completed.forEach(job => delete job.last_folded_time);

        return { inProgress, completed };

    } catch (err) {
        console.error('Database error:', err);
        throw err;
    }
}

async function jobsEventsHandler(req, res) {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });
    res.flushHeaders();

    try {
        const jobs = await getJobsFromDatabase();
        res.write(`data: ${JSON.stringify(jobs)}\n\n`);
    } catch (err) {
        console.error('Initial fetch error:', err);
        res.write(`data: ${JSON.stringify({ inProgress: [], completed: [], error: 'Failed to fetch jobs' })}\n\n`);
    }

    const interval = setInterval(async () => {
        try {
            const jobs = await getJobsFromDatabase();
            res.write(`data: ${JSON.stringify(jobs)}\n\n`);
        } catch (err) {
            console.error('Error fetching jobs:', err);
        }
    }, 4000);

    req.on("close", () => {
        clearInterval(interval);
        console.log("Client disconnected");
    });
}

module.exports = jobsEventsHandler;