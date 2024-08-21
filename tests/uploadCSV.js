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
  logger.error('Please specify path to a CSV file');
  process.exit();
}
const csvFile = process.argv[2];
let csvTrueLinks = '';
if (process.argv[3]) {
  csvTrueLinks = process.argv[3];
}

try {
  if (!fs.existsSync(csvFile)) {
    logger.error(`Cant find file ${csvFile}`);
    process.exit();
  }
  if (!fs.existsSync(csvTrueLinks)) {
    csvTrueLinks = '';
  }
} catch (err) {
  logger.error(err);
  process.exit();
}

const ext = path.extname(csvFile);
const extTrueLinks = path.extname(csvTrueLinks);
if (ext !== '.csv') {
  logger.error('File is not a CSV');
  process.exit();
}
if (extTrueLinks !== '.csv') {
  csvTrueLinks = '';
}

logger.info('Upload started ...');
const bundles = [];
const bundle = {};
bundle.type = 'batch';
bundle.resourceType = 'Bundle';
bundle.entry = [];
const promises = [];
let totalRecords = 0;
fs.createReadStream(path.resolve(__dirname, '', csvFile))
  .pipe(
    csv.parse({
      headers: true,
    })
  )
  .on('error', error => console.error(error))
  .on('data', row => {
    promises.push(
      new Promise((resolve, reject) => {
        let sex = row['gender'];
        let given = row['first_name'] + ' ' + row['second_name'];
        let surname = row['last_name'];
        let phone = row['cell_number'];
        let nationalID = row['art_id'];
        let UPID = row['up_id'];
        let birthDate = row['date_of_birth'];

        let date_enrollement = row['date_enrollement'];
        let date_Initiation_ARV = row['date_Initiation_ARV'];
        let StatutPatient = row['StatutPatient'];
        let DateStatutPatient = row['DateStatutPatient'];

        if (sex) {
          sex = sex.trim();
        }

        if (given) {
          given = given.trim();
        }
        if (surname) {
          surname = surname.trim();
        }
        if (phone) {
          phone = phone.trim();
        }
        if (nationalID) {
          nationalID = nationalID.trim();
        }
        if (UPID) {
          UPID = UPID.trim();
        }
        if (birthDate) {
          birthDate = birthDate.trim();
        }

        if (date_enrollement) {
          date_enrollement = date_enrollement.trim();
        }
        if (date_Initiation_ARV) {
          date_Initiation_ARV = date_Initiation_ARV.trim();
        }
        if (StatutPatient) {
          StatutPatient = StatutPatient.trim();
        }
        if (DateStatutPatient) {
          DateStatutPatient = DateStatutPatient.trim();
        }

        const resource = {
          meta: {
            tag: [{
              system: "http://openclientregistry.org/fhir/tag/csv",
              code: "50a0ed16-c2e6-4319-8687-43a6a1a2d1e7",
              display: "Uganda CSV Data"
            }]
          }
        };
        resource.resourceType = 'Patient';
        resource.birthDate = birthDate;
        resource.gender = sex;
        /* if ( birthDate.match( /\d{8,8}/ ) ) {
          const birthMoment = moment( birthDate );
          if ( birthMoment.isValid() ) {
            resource.birthDate = birthMoment.format("YYYY-MM-DD");
          }
        } */
        resource.identifier = [
          {
            system: 'http://clientregistry.org/openmrs',
            value: uuidv4(),
          },
        ];
        if (nationalID) {
          resource.identifier.push({
            system: 'http://openelis-global.org/pat_nationalId',
            value: nationalID,
            use: 'official'
          });
        }
        if (UPID) {
          resource.identifier.push({
            system: 'https://openmrs.org/UPI',
            value: UPID,
          });
        }
        if (phone) {
          resource.telecom = [];
          resource.telecom.push({
            system: 'phone',
            value: phone,
          });
        }
        const name = {};
        if (given) {
          name.given = [given];
        }
        if (surname) {
          name.family = surname;
        }
        name.use = 'official';
        resource.name = [name];
        //Extensions
        // Add extensions to the resource itself
        resource.extension = [];
        if (date_enrollement) {
          resource.extension.push({
            url: 'patient_date_enrollement',
            valueDate: date_enrollement,
          });
        }
        if (date_Initiation_ARV) {
          resource.extension.push({
            url: 'patient_date_Initiation_ARV',
            valueDate: date_Initiation_ARV,
          });
        }
        if (StatutPatient) {
          resource.extension.push({
            url: 'patient_status',
            valueString: StatutPatient,
          });
        }
        if (DateStatutPatient) {
          resource.extension.push({
            url: 'patient_status_date',
            valueDate: DateStatutPatient,
          });
        }
        bundle.entry.push({
          resource,
        });

        if (bundle.entry.length === 250) {
          totalRecords += 250;
          const tmpBundle = {
            ...bundle,
          };
          bundles.push(tmpBundle);
          bundle.entry = [];
        }
        resolve();
      })
    );
  })
  .on('end', rowCount => {
    if (bundle.entry.length > 0) {
      totalRecords += bundle.entry.length;
      bundles.push(bundle);
    }
    //Get credentials from the file or hardcode for each file
    const auth = {
      username: 'sigdep3',
      password: 'sigdep3'
    };


    const options = {
      url: 'https://dev.cihis.org/openhimcore/CR/fhir',
      //agentOptions,
      auth,
      json: bundles[0]
    };

    request.post(options, (err, res, body) => {
      if (err) {
        logger.error('An error has occured');
        logger.error(err);
        return nxtEntry();
      }
      if (res.headers.location) {
        logger.info({
          'Patient ID': res.headers.location,
          'Patient CRUID': res.headers.locationcruid
        });
      } else {
        logger.error('Something went wrong, no CRUID created');
      }

      console.timeEnd('Processing Took');

      console.timeEnd('Total Processing Time');
      if (csvTrueLinks) {
        uploadResults.uploadResults(csvTrueLinks);
      } else {
        console.log(
          'True links were not specified then upload results wont be displayed'
        );
      }
    });
  });
