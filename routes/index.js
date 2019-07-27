const fs = require('fs');
const express = require('express');
const router = express.Router();
const excelToJson = require('convert-excel-to-json');
const connection = require('../connection');

// получить список имён файлов, находящихся на сервере в папке excel-files
router.get('/files-list', (req, res) => {
  const files = fs.readdirSync('excel-files');
  res.json(files);
});

// импортировать в базу данных MySQL содержимое excel-файла с указанным именем
router.post('/', (req, res) => {
  console.log(req.body);
  if (!req.body.fileName || !fs.existsSync(`excel-files/${req.body.fileName}`)) {
    res.writeHead(500, 'Invalid data in request or file with such name does not exists.');
    res.end();
  }

  const result = excelToJson({
    sourceFile: `excel-files/${req.body.fileName}`
  });

  let billList = [];
  let groupedBillList = [];
  let currentClassTitle = '';
  let groupedBillPosition = 0;

  connection.query(`insert into excel_file_names(title) values('${req.body.fileName}')`, (err, rows) => {
    if (err) throw err;
    let fileId = rows.insertId;

    for (const row of result.Sheet1) {
      if (row['A'] && row['A'].toString().match(/^КЛАСС/)) {
        connection.query(`insert into classes(title, fileId) values('${row['A']}', ${fileId})`, (err) => {
          if (err) throw err;
        });
        currentClassTitle = row['A'];
        continue;
      }

      if (row['A'] && row['A'].toString().match(/^[0-9]{4}$/)) {
        billList.push({...row, classTitle: currentClassTitle, groupedBillPosition: groupedBillPosition});
        continue;
      }

      if (row['A'] && row['A'].toString().match(/^[0-9]{2}$/)) {
        groupedBillPosition++;
        groupedBillList.push({...row});
        connection.query(`select id from classes where title = '${currentClassTitle}' and fileId = ${fileId};`, (err, rows) => {
          if (err) throw err;
          let classTitleInsertedId = rows[0].id;
          connection.query(`insert into grouped_incoming_balance_bills(groupedBillNumber, groupedAsset, groupedLiability, classId, fileId)
          values(${row['A']}, ${row['B']}, ${row['C']}, ${classTitleInsertedId}, ${fileId});
          insert into grouped_turns_bills(groupedBillNumber, groupedDebit, groupedCredit, classId, fileId)
          values(${row['A']}, ${row['D']}, ${row['E']}, ${classTitleInsertedId}, ${fileId});
          insert into grouped_outcoming_balance_bills(groupedBillNumber, groupedAsset, groupedLiability, classId, fileId)
          values(${row['A']}, ${row['F']}, ${row['G']}, ${classTitleInsertedId}, ${fileId});`, (err) => {
            if (err) throw err;
          });
        });
      }
    }

    for (const item of billList) {
      connection.query(`select id from classes where title = '${item.classTitle}' and fileId = ${fileId};`, (err, rows) => {
        let classTitleInsertedId = rows[0].id;
        connection.query(`select id from grouped_incoming_balance_bills
       where groupedBillNumber = '${groupedBillList[item.groupedBillPosition].A}' and fileId = ${fileId};`, (err, rows) => {
          if (err) throw err;
          let groupedBillId = rows[0].id;
            connection.query(`insert into incoming_balance(billNumber, asset, liability, classId, groupedBillId, fileId)
            values(${item['A']}, ${item['B']}, ${item['C']}, ${classTitleInsertedId}, ${groupedBillId}, ${fileId});
            insert into turns(billNumber, debit, credit, classId, groupedBillId, fileId)
            values(${item['A']}, ${item['D']}, ${item['E']}, ${classTitleInsertedId}, ${groupedBillId}, ${fileId});
            insert into outcoming_balance(billNumber, asset, liability, classId, groupedBillId, fileId)
            values(${item['A']}, ${item['F']}, ${item['G']}, ${classTitleInsertedId}, ${groupedBillId}, ${fileId});`,
              (err, rows) => {
                console.log(rows);
              });
        });
      });
    }
  });

  res.send({ message: 'Importing file to database.'});
});

// получить содержимое импортированного в базу данных файла
router.get('/imported-files/:id', (req, res) => {
  connection.query(`select title from excel_file_names where id = ${req.params.id}`,
    (err, rows) => {
    if (rows && rows.length) {
      let fileName = rows[0].title;

      let result = {
        incomingBalance: [],
        turns: [],
        outcomingBalance: [],
      };

      connection.query(`select i.billNumber, i.asset, i.liability, g.groupedBillNumber, g.groupedAsset, g.groupedLiability, c.title
                      from incoming_balance i
                      join grouped_incoming_balance_bills g on i.groupedBillId = g.id
                      join classes c on g.classId = c.id
                      join excel_file_names e on c.fileId = e.id
                      where e.title = '${fileName}';`, (err, rows) => {
        for (const item of rows) {
          result.incomingBalance.push(item);
        }

        connection.query(`select o.billNumber, o.asset, o.liability, g.groupedBillNumber, g.groupedAsset, g.groupedLiability, c.title
                        from outcoming_balance o
                        join grouped_outcoming_balance_bills g on o.groupedBillId = g.id
                        join classes c on g.classId = c.id
                        join excel_file_names e on c.fileId = e.id
                        where e.title = '${fileName}';`, (err, rows) => {
          for (const item of rows) {
            result.outcomingBalance.push(item);
          }

          connection.query(`select t.billNumber, t.debit, t.credit, g.groupedBillNumber, g.groupedDebit, g.groupedCredit, c.title
                          from turns t
                          join grouped_turns_bills g on t.groupedBillId = g.id
                          join classes c on g.classId = c.id
                          join excel_file_names e on c.fileId = e.id
                          where e.title = '${fileName}';`, (err, rows) => {
            for (const item of rows) {
              result.turns.push(item);
            }
            console.log(result);
            res.json(result);
          });
        });
      });
    } else {
      res.writeHead(404, 'File with such id does not exists in database.');
      res.end();
    }
  });
});

// получить список имён файлов, импортированных в базу данных
router.get('/imported-files', (req, res) => {
  connection.query(`select * from excel_file_names`,
    (err, rows) => {
      res.json(rows);
    });
});

// получить имя файла, импортированного в базу данных по id
router.get('/imported-files-title/:id', (req, res) => {
  connection.query(`select title from excel_file_names where id = ${req.params.id}`,
    (err, rows) => {
      if (rows && rows.length) {
        let fileName = rows[0].title;
        res.json({fileName});
      } else {
        res.writeHead(404, 'File with such id does not exists in database.');
        res.end();
      }
    });
});

module.exports = router;