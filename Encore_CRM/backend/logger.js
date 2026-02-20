const fs = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Users = require('./models/userModel');

const logsDir = path.join(__dirname, 'logs');
const LOG_RETENTION_DAYS = 10;

(async () => {
    try {
        await fs.mkdir(logsDir, { recursive: true });
    } catch (err) {
        console.error('Error creating logs directory:', err);
    }
})();

function getExcelFilePath() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return path.join(logsDir, `${day}${month}${year}logs.xlsx`);
}

async function cleanOldLogs() {
    try {
        const files = await fs.readdir(logsDir);
        const now = new Date();

        for (const file of files) {
            const filePath = path.join(logsDir, file);
            try {
                const stats = await fs.stat(filePath);
                const createdTime = new Date(stats.birthtime);
                const ageInDays = (now - createdTime) / (1000 * 60 * 60 * 24);

                if (ageInDays > LOG_RETENTION_DAYS) {
                    await fs.unlink(filePath);
                    console.log(`Deleted old log file: ${file}`);
                }
            } catch (err) {
                // Ignore individual file errors
            }
        }
    } catch (err) {
        // Ignore global readdir error
    }
}

function parseErrorDetails(functionName, error) {
    const timestamp = new Date().toISOString();
    const stackLines = error.stack.split('\n');
    const fileLine = stackLines[1] || 'N/A';
    const errorMessage = error.message;

    return {
        'Logged Time': timestamp,
        'Function Name': functionName,
        'Error': errorMessage,
        'File Name': fileLine.trim(),
    };
}

function formatLoggedTime() {
    const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
    return formatter.format(new Date()).replace(',', '');
}

function applyColumnStyles(worksheet, headers) {
    worksheet['!cols'] = headers.map((header) => {
        switch (header) {
            case 'Error':
                return { wch: 60 };
            case 'File Name':
                return { wch: 80 };
            default:
                return { wch: 25 };
        }
    });
}

async function findLoggedUserName(user) {
    try {
        const userObjId = new mongoose.Types.ObjectId(user);
        const prodEmpDetails = await Users.findOne({ _id: userObjId });

        if (!prodEmpDetails) {
            throw new Error('User not found');
        }

        const userName = `${prodEmpDetails.user_firstName} ${prodEmpDetails.user_lastName}`;
        return userName;
    } catch (error) {
        console.error("Error fetching user details:", error);
        throw error;
    }
}

async function logErrorToExcel(functionName, error, user) {
    try {
        let loggedUser = 'Unknown';
        if (user) {
            try {
                loggedUser = await findLoggedUserName(user);
            } catch (innerErr) {
                console.warn("Could not resolve user name, defaulting to 'Unknown'");
            }
        }
        await cleanOldLogs();
        const excelFilePath = getExcelFilePath();
        const timestamp = formatLoggedTime();
        const parsed = parseErrorDetails(functionName, error);
        parsed['Logged Time'] = timestamp;
        parsed['Logged User'] = loggedUser;

        // Rearranged headers
        const headers = ['Error', 'Function Name', 'Logged Time', 'Logged User', 'File Name'];
        let workbook;
        let worksheet;
        let sheetData = [];

        try {
            await fs.access(excelFilePath);
            workbook = XLSX.readFile(excelFilePath);

            const sheetName = 'Logs';
            if (workbook.SheetNames.includes(sheetName)) {
                worksheet = workbook.Sheets[sheetName];
                sheetData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            }
            sheetData.push(parsed);
            worksheet = XLSX.utils.json_to_sheet(sheetData, { header: headers });
            applyColumnStyles(worksheet, headers);
            workbook.Sheets[sheetName] = worksheet;
        } catch {
            sheetData.push(parsed);
            worksheet = XLSX.utils.json_to_sheet(sheetData, { header: headers });
            applyColumnStyles(worksheet, headers);
            workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');
        }

        XLSX.writeFile(workbook, excelFilePath);
    } catch (err) {
        console.error("Failed to log error to Excel:", err);
    }
}

// Wrapper functions for compatibility
const logger = {
    logError: logErrorToExcel,
    error: (message, error, user) => {
        if (error && error instanceof Error) {
            logErrorToExcel(message, error, user);
        } else {
            console.error(message, error);
        }
    },
    warn: (...args) => console.warn(...args),
    info: (...args) => console.log(...args),
    debug: (...args) => console.log(...args)
};

module.exports = logger;