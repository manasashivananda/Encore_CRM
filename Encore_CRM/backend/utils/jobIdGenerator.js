const sql = require('mssql');
const config = require('../config/sqlConfig');
const Template = require('../models/templateModel');

// Track rapid calls within the same process
let lastGeneratedSequence = null;
let lastGeneratedDate = null;

/**
 * Get current date in Australia/Sydney timezone (handles daylight saving automatically)
 * Returns date string in yyyyMMdd format
 */
function getAustralianDateString(timeZone = 'Australia/Sydney') {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = fmt.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}${parts.month}${parts.day}`;
}

async function generateNextJobId() {
  const yyyyMMdd = getAustralianDateString(); // e.g. "20251211" in Australian timezone

  let pool;
  try {
    pool = await sql.connect(config);

    const result = await pool.request()
      .input('prefix', sql.VarChar(8), yyyyMMdd)
      .query(`
        SELECT TOP 1 JobID
        FROM Jobs
        WHERE LEFT(CAST(JobID AS VARCHAR), 8) = @prefix
        ORDER BY JobID DESC
      `);

    // Also check MongoDB templates for existing Job IDs to avoid collisions
    const templatesWithJobIds = await Template.find({
      swiJobIds: { $exists: true, $ne: [] }
    }).select('swiJobIds');

    const allExistingJobIds = templatesWithJobIds.flatMap(t => t.swiJobIds || []);
    const todaysJobIds = allExistingJobIds.filter(id => id && id.toString().startsWith(yyyyMMdd));

    let nextJobId;
    let newCounter;

    let maxCounterFromSWI = 0;
    if (result.recordset.length > 0) {
      const lastId = result.recordset[0].JobID.toString(); // e.g. "202507240004"
      maxCounterFromSWI = parseInt(lastId.slice(8), 10);

      if (isNaN(maxCounterFromSWI)) {
        throw new Error(`Invalid JobID format in DB: ${lastId}`);
      }
    }

    let maxCounterFromMongo = 0;
    if (todaysJobIds.length > 0) {
      todaysJobIds.forEach(id => {
        const counter = parseInt(id.toString().slice(8), 10);
        if (counter > maxCounterFromMongo) {
          maxCounterFromMongo = counter;
        }
      });
    }

    // Use the maximum counter from all sources
    const maxCounter = Math.max(maxCounterFromSWI, maxCounterFromMongo);

    // Check if we've already generated a sequence for today in memory
    if (lastGeneratedDate === yyyyMMdd && lastGeneratedSequence > maxCounter) {
      // Use in-memory counter for rapid successive calls
      newCounter = lastGeneratedSequence + 1;
    } else {
      // Use max counter + 1
      newCounter = maxCounter + 1;
    }

    // Update in-memory tracking
    lastGeneratedSequence = newCounter;
    lastGeneratedDate = yyyyMMdd;

    nextJobId = `${yyyyMMdd}${newCounter.toString().padStart(4, '0')}`;

    return nextJobId;

  } catch (err) {
    throw new Error('Failed to generate JobID');
  } finally {
    if (pool) await pool.close();
  }
}

module.exports = { generateNextJobId };
