const sql = require('mssql');
const config = require('../config/sqlConfig');

// Create a connection pool promise
let poolPromise = new sql.ConnectionPool(config).connect();

exports.fetchMachineDataDropdown = async (req, res) => {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // Fetch machines and materials in parallel
        const [machinesResult, materialsResult] = await Promise.all([
            request.query(`
                SELECT DISTINCT MachineId AS Machines
                FROM StatsMaterial
                ORDER BY MachineId ASC
            `),
            request.query(`
                SELECT DISTINCT Material
                FROM Materials
                ORDER BY Material ASC
            `)
        ]);

        const machines = machinesResult.recordset.map(row => row.Machines);
        const materials = materialsResult.recordset.map(row => row.Material);

        res.json({
            Machines: machines,
            Materials: materials
        });

    } catch (error) {
        console.error("Error fetching machine data dropdown:", error);
        res.status(500).send("Server Error");
    }
};

exports.fetchMachineMaterialColourDropdown = async (req, res) => {
    try {
        const material = req.query.material;
        const pool = await poolPromise;
        const request = pool.request();

        request.input('material', material);

        const select = await request.query(`
            SELECT DISTINCT Colour
            FROM Colours
            WHERE Material = @material
            ORDER BY Colour ASC
        `);

        const colours = select.recordset
            .map(row => row.Colour)
            .filter(colour => colour && colour !== '.');

        res.json({
            Colours: colours
        });
    } catch (error) {
        console.error("Error fetching colours:", error);
        res.status(500).send("Server Error");
    }
};

exports.fetchFoldingMachinesDropdown = async (req, res) => {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        const select = await request.query(`
            SELECT DISTINCT FoldedBy AS Machines
            FROM Jobs
            WHERE FoldedBy IS NOT NULL
            ORDER BY FoldedBy ASC
        `);

        const machines = select.recordset.map(row => row.Machines);

        res.json({
            Machines: machines
        });

    } catch (error) {
        console.error("Error fetching folding machines:", error);
        res.status(500).send("Server Error");
    }
};

exports.fetchSWIMachineOffcutsReport = async (req, res) => {
    try {
        const { machineId, startDate, endDate, isDateRange } = req.query;
        const pool = await poolPromise;
        const request = pool.request();

        // Build WHERE clause dynamically
        let whereConditions = [];

        if (startDate && endDate) {
            if (isDateRange === 'true') {
                // Daily mode: filter by full dates only (ignore time component)
                whereConditions.push("CAST(StartTime AS DATE) >= CAST(@startDate AS DATE) AND CAST(StartTime AS DATE) <= CAST(@endDate AS DATE)");
            } else {
                // Hourly mode: filter by exact datetime using CONVERT with style 120 (yyyy-mm-dd hh:mi:ss)
                whereConditions.push("StartTime >= CONVERT(DATETIME, @startDate, 120) AND StartTime <= CONVERT(DATETIME, @endDate, 120)");
            }
            // Pass as VarChar to avoid JS Date UTC conversion - SQL Server will parse the datetime string in local time
            request.input('startDate', sql.VarChar(50), startDate);
            request.input('endDate', sql.VarChar(50), endDate);
        }

        if (machineId && machineId !== '') {
            whereConditions.push("MachineId = @machineId");
            request.input('machineId', machineId);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        let selectQuery;
        let hourlyData;

        if (isDateRange === 'true') {
            // Date range: Group by date
            selectQuery = `
                SELECT
                    CAST(StartTime AS DATE) AS ReportDate,
                    SUM(OffcutArea) AS TotalOffcutsArea,
                    SUM(WasteArea) AS TotalWasteArea,
                    SUM(ProductArea) AS TotalProductArea,
                    SUM(CutArea) AS TotalCutArea,
                    MachineID
                FROM StatsMaterial
                ${whereClause}
                GROUP BY CAST(StartTime AS DATE), MachineID
                ORDER BY ReportDate ASC, MachineID ASC
            `;

            const select = await request.query(selectQuery);

            hourlyData = select.recordset.map(row => {
                const offcuts = parseFloat(row.TotalOffcutsArea) || 0;
                const waste = parseFloat(row.TotalWasteArea) || 0;
                const cut = parseFloat(row.TotalCutArea) || 1;
                return {
                    date: row.ReportDate ? new Date(row.ReportDate).toISOString().split('T')[0] : '',
                    offcutsArea: offcuts.toFixed(1),
                    machineId: row.MachineID,
                    wasteArea: waste.toFixed(1),
                    productArea: (parseFloat(row.TotalProductArea) || 0).toFixed(1),
                    cutArea: cut.toFixed(1),
                    result: ((offcuts + waste) / cut * 100).toFixed(2)
                };
            });
        } else {
            // Hourly view: Group by hour
            selectQuery = `
                SELECT
                    DATEPART(HOUR, StartTime) AS HourStart,
                    SUM(OffcutArea) AS TotalOffcutsArea,
                    SUM(WasteArea) AS TotalWasteArea,
                    SUM(ProductArea) AS TotalProductArea,
                    SUM(CutArea) AS TotalCutArea,
                    MachineID
                FROM StatsMaterial
                ${whereClause}
                GROUP BY DATEPART(HOUR, StartTime), MachineID
                ORDER BY HourStart ASC, MachineID ASC
            `;

            const select = await request.query(selectQuery);

            hourlyData = select.recordset.map(row => {
                const offcuts = parseFloat(row.TotalOffcutsArea) || 0;
                const waste = parseFloat(row.TotalWasteArea) || 0;
                const cut = parseFloat(row.TotalCutArea) || 1;
                const hour = row.HourStart;
                return {
                    timeRange: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
                    hour,
                    offcutsArea: offcuts.toFixed(1),
                    machineId: row.MachineID,
                    wasteArea: waste.toFixed(1),
                    productArea: (parseFloat(row.TotalProductArea) || 0).toFixed(1),
                    cutArea: cut.toFixed(1),
                    result: ((offcuts + waste) / cut * 100).toFixed(2)
                };
            });
        }

        res.json(hourlyData);

    } catch (error) {
        console.error("Error fetching machine offcuts report:", error);
        res.status(500).send("Server Error");
    }
};

exports.fetchSWIMachineDetailedReport = async (req, res) => {
    try {
        const { machineId, startDate, endDate, isDateRange, material, colour } = req.query;
        const pool = await poolPromise;
        const request = pool.request();

        // Build WHERE clause dynamically
        let whereConditions = [];

        if (startDate && endDate) {
            if (isDateRange === 'true') {
                // Daily mode: filter by full dates only (ignore time component)
                whereConditions.push("CAST(StartTime AS DATE) >= CAST(@startDate AS DATE) AND CAST(StartTime AS DATE) <= CAST(@endDate AS DATE)");
            } else {
                // Hourly mode: filter by exact datetime using CONVERT with style 120 (yyyy-mm-dd hh:mi:ss)
                whereConditions.push("StartTime >= CONVERT(DATETIME, @startDate, 120) AND StartTime <= CONVERT(DATETIME, @endDate, 120)");
            }
            // Pass as VarChar to avoid JS Date UTC conversion - SQL Server will parse the datetime string in local time
            request.input('startDate', sql.VarChar(50), startDate);
            request.input('endDate', sql.VarChar(50), endDate);
        }

        if (machineId && machineId !== '') {
            whereConditions.push("MachineId = @machineId");
            request.input('machineId', machineId);
        }

        if (material && material !== '') {
            whereConditions.push("Material = @material");
            request.input('material', material);
        }

        if (colour && colour !== '') {
            whereConditions.push("Colour = @colour");
            request.input('colour', colour);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        let selectQuery;
        let detailedData;

        if (isDateRange === 'true') {
            // Date range: Group by date
            selectQuery = `
                SELECT
                    CAST(StartTime AS DATE) AS ReportDate,
                    MachineID,
                    Material,
                    Colour,
                    SUM(CutLength) AS CutLength,
                    SUM(CutArea) AS CutArea,
                    SUM(ProductArea) AS ProductArea,
                    SUM(OffcutArea) AS OffcutArea,
                    SUM(WasteArea) AS WasteArea,
                    SUM(WorkPieces) AS WorkPieces,
                    SUM(Offcuts) AS Offcuts,
                    SUM(ProductLinearLength) AS ProductLinearLength,
                    SUM(OffcutsLinearLength) AS OffcutsLinearLength,
                    SUM(WasteLinearLength) AS WasteLinearLength,
                    SUM(JoggedLinearLength) AS JoggedLinearLength
                FROM StatsMaterial
                ${whereClause}
                GROUP BY CAST(StartTime AS DATE), MachineID, Material, Colour
                ORDER BY ReportDate ASC, MachineID ASC
            `;

            const select = await request.query(selectQuery);

            detailedData = select.recordset.map(row => ({
                date: row.ReportDate ? new Date(row.ReportDate).toISOString().split('T')[0] : '',
                machineId: row.MachineID,
                material: row.Material,
                colour: row.Colour,
                cutLength: (parseFloat(row.CutLength) || 0).toFixed(3),
                cutArea: (parseFloat(row.CutArea) || 0).toFixed(3),
                productArea: (parseFloat(row.ProductArea) || 0).toFixed(3),
                offcutArea: (parseFloat(row.OffcutArea) || 0).toFixed(3),
                wasteArea: (parseFloat(row.WasteArea) || 0).toFixed(3),
                workPieces: row.WorkPieces || 0,
                offcuts: row.Offcuts || 0,
                productLinearLength: (parseFloat(row.ProductLinearLength) || 0).toFixed(3),
                offcutsLinearLength: (parseFloat(row.OffcutsLinearLength) || 0).toFixed(3),
                wasteLinearLength: (parseFloat(row.WasteLinearLength) || 0).toFixed(3),
                joggedLinearLength: (parseFloat(row.JoggedLinearLength) || 0).toFixed(3)
            }));
        } else {
            // Hourly view: Group by hour
            selectQuery = `
                SELECT
                    DATEPART(HOUR, StartTime) AS HourStart,
                    MachineID,
                    Material,
                    Colour,
                    SUM(CutLength) AS CutLength,
                    SUM(CutArea) AS CutArea,
                    SUM(ProductArea) AS ProductArea,
                    SUM(OffcutArea) AS OffcutArea,
                    SUM(WasteArea) AS WasteArea,
                    SUM(WorkPieces) AS WorkPieces,
                    SUM(Offcuts) AS Offcuts,
                    SUM(ProductLinearLength) AS ProductLinearLength,
                    SUM(OffcutsLinearLength) AS OffcutsLinearLength,
                    SUM(WasteLinearLength) AS WasteLinearLength,
                    SUM(JoggedLinearLength) AS JoggedLinearLength
                FROM StatsMaterial
                ${whereClause}
                GROUP BY DATEPART(HOUR, StartTime), MachineID, Material, Colour
                ORDER BY HourStart ASC, MachineID ASC
            `;

            const select = await request.query(selectQuery);

            detailedData = select.recordset.map(row => {
                const hour = row.HourStart;
                return {
                    timeRange: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
                    hour,
                    machineId: row.MachineID,
                    material: row.Material,
                    colour: row.Colour,
                    cutLength: (parseFloat(row.CutLength) || 0).toFixed(3),
                    cutArea: (parseFloat(row.CutArea) || 0).toFixed(3),
                    productArea: (parseFloat(row.ProductArea) || 0).toFixed(3),
                    offcutArea: (parseFloat(row.OffcutArea) || 0).toFixed(3),
                    wasteArea: (parseFloat(row.WasteArea) || 0).toFixed(3),
                    workPieces: row.WorkPieces || 0,
                    offcuts: row.Offcuts || 0,
                    productLinearLength: (parseFloat(row.ProductLinearLength) || 0).toFixed(3),
                    offcutsLinearLength: (parseFloat(row.OffcutsLinearLength) || 0).toFixed(3),
                    wasteLinearLength: (parseFloat(row.WasteLinearLength) || 0).toFixed(3),
                    joggedLinearLength: (parseFloat(row.JoggedLinearLength) || 0).toFixed(3)
                };
            });
        }

        res.json(detailedData);
    } catch (error) {
        console.error("Error fetching machine detailed report:", error);
        res.status(500).send("Server Error");
    }
};

// Fetch Machine Fold Report - shows pieces folded by machine (FoldedBy) in hourly/daily basis
exports.fetchSWIMachineFoldReport = async (req, res) => {
    try {
        const { machineId, startDate, endDate, isDateRange } = req.query;
        const pool = await poolPromise;
        const request = pool.request();

        // Build WHERE clause dynamically
        let whereConditions = [];

        if (startDate && endDate) {
            if (isDateRange === 'true') {
                // Daily mode: filter by full dates only (ignore time component)
                whereConditions.push("CAST(Folded AS DATE) >= CAST(@startDate AS DATE) AND CAST(Folded AS DATE) <= CAST(@endDate AS DATE)");
            } else {
                // Hourly mode: filter by exact datetime
                whereConditions.push("Folded >= CONVERT(DATETIME, @startDate, 120) AND Folded <= CONVERT(DATETIME, @endDate, 120)");
            }
            request.input('startDate', sql.VarChar(50), startDate);
            request.input('endDate', sql.VarChar(50), endDate);
        }

        if (machineId && machineId !== '') {
            whereConditions.push("FoldedBy = @machineId");
            request.input('machineId', machineId);
        }

        // Only include records that have been folded
        whereConditions.push("Folded IS NOT NULL");
        whereConditions.push("FoldedBy IS NOT NULL AND FoldedBy != ''");

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        let selectQuery;
        let reportData;

        if (isDateRange === 'true') {
            // Date range: Group by date
            selectQuery = `
                SELECT
                    CAST(Folded AS DATE) AS ReportDate,
                    FoldedBy AS MachineName,
                    SUM(QtyFolded) AS TotalPiecesFolded
                FROM Jobs
                ${whereClause}
                GROUP BY CAST(Folded AS DATE), FoldedBy
                ORDER BY ReportDate ASC, FoldedBy ASC
            `;

            const select = await request.query(selectQuery);

            reportData = select.recordset.map(row => ({
                date: row.ReportDate ? new Date(row.ReportDate).toISOString().split('T')[0] : '',
                machineName: row.MachineName,
                totalPieces: row.TotalPiecesFolded || 0
            }));
        } else {
            // Hourly view: Group by hour
            selectQuery = `
                SELECT
                    DATEPART(HOUR, Folded) AS HourStart,
                    FoldedBy AS MachineName,
                    SUM(QtyFolded) AS TotalPiecesFolded
                FROM Jobs
                ${whereClause}
                GROUP BY DATEPART(HOUR, Folded), FoldedBy
                ORDER BY HourStart ASC, FoldedBy ASC
            `;

            const select = await request.query(selectQuery);

            reportData = select.recordset.map(row => {
                const hour = row.HourStart;
                return {
                    timeRange: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
                    hour,
                    machineName: row.MachineName,
                    totalPieces: row.TotalPiecesFolded || 0
                };
            });
        }

        res.json(reportData);

    } catch (error) {
        console.error("Error fetching machine fold report:", error);
        res.status(500).send("Server Error");
    }
};