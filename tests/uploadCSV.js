const fs = require('fs');
const async = require('async');
const csv = require('fast-csv');
const path = require('path');
const request = require('request');
const moment = require('moment');
const uploadResults = require('./uploadResults');
const logger = require('../server/lib/winston');
const { v4: uuidv4 } = require('uuid');

if (!process.argv[2]) {
  logger.error('Please specify the path to a CSV file');
  process.exit();
}
const csvFile = process.argv[2];
let csvTrueLinks = '';
if (process.argv[3]) {
  csvTrueLinks = process.argv[3];
}

try {
  if (!fs.existsSync(csvFile)) {
    logger.error(`Can't find file ${csvFile}`);
    process.exit();
  }
  if (csvTrueLinks && !fs.existsSync(csvTrueLinks)) {
    csvTrueLinks = '';
  }
} catch (err) {
  logger.error(err);
  process.exit();
}

const ext = path.extname(csvFile);
if (ext !== '.csv') {
  logger.error('File is not a CSV');
  process.exit();
}

logger.info('Upload started ...');
const bundles = [];
let bundle = {
  type: 'batch',
  resourceType: 'Bundle',
  entry: []
};
let totalRecords = 0;

fs.createReadStream(path.resolve(__dirname, '', csvFile))
  .pipe(csv.parse({ headers: true }))
  .on('error', error => logger.error(error))
  .on('data', row => {
    const resource = {
      resourceType: 'Patient',
      birthDate: row['date_of_birth']?.trim(),
      gender: row['gender']?.trim(),
      identifier: [
        { system: 'http://clientregistry.org/openmrs', value: uuidv4() },
        row['art_id'] ? { system: 'http://openelis-global.org/pat_nationalId', value: row['art_id'].trim(), use: 'official' } : null,
        row['up_id'] ? { system: 'https://openmrs.org/UPI', value: row['up_id'].trim() } : null
      ].filter(Boolean),
      telecom: row['cell_number'] ? [{ system: 'phone', value: row['cell_number'].trim() }] : [],
      name: [{
        use: 'official',
        given: row['first_name'] && row['second_name'] ? [row['first_name'].trim() + ' ' + row['second_name'].trim()] : [],
        family: row['last_name']?.trim()
      }],
      extension: [
        row['date_enrollement'] ? { url: 'patient_date_enrollement', valueDate: row['date_enrollement'].trim() } : null,
        row['date_Initiation_ARV'] ? { url: 'patient_date_Initiation_ARV', valueDate: row['date_Initiation_ARV'].trim() } : null,
        row['StatutPatient'] ? { url: 'patient_status', valueString: row['StatutPatient'].trim() } : null,
        row['DateStatutPatient'] ? { url: 'patient_status_date', valueDate: row['DateStatutPatient'].trim() } : null
      ].filter(Boolean)
    };

    bundle.entry.push({ resource });

    if (bundle.entry.length === 250) {
      bundles.push({ ...bundle });
      totalRecords += bundle.entry.length;
      bundle.entry = [];
    }
  })
  .on('end', () => {
    if (bundle.entry.length > 0) {
      bundles.push({ ...bundle });
      totalRecords += bundle.entry.length;
    }

    const auth = { username: 'sigdep3', password: 'sigdep3' };

    const sendBundle = (i = 0) => {
      if (i >= bundles.length) {
        logger.info(`All ${totalRecords} records processed.`);
        if (csvTrueLinks) uploadResults.uploadResults(csvTrueLinks);
        return;
      }

      const options = {
        url: 'https://dev.cihis.org/openhimcore/CR/fhir',
        auth,
        json: bundles[i]
      };

      request.post(options, (err, res) => {
        if (err) {
          logger.error('An error has occurred');
          logger.error(err);
        } else if (res.headers.location) {
          logger.info(`Bundle ${i + 1} processed successfully.`);
        } else {
          logger.error('Something went wrong, no CRUID created');
        }

        setTimeout(() => sendBundle(i + 1), 1 * 60 * 1000); // Delay of 2 minutes
      });
    };

    sendBundle();
  });
