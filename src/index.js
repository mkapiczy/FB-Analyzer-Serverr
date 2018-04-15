const express = require('express');
const expressfileUpload = require('express-fileupload');
const app = express();
const extract = require('extract-zip');
const resolve = require('path').resolve
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require("fs"));
const cors = require('cors');
import rimraf from 'rimraf'

app.use(expressfileUpload());

//enables cors
app.use(cors({
    'allowedHeaders': ['sessionId', 'Content-Type'],
    'exposedHeaders': ['sessionId'],
    'origin': '*',
    'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'preflightContinue': false
}));

app.get('/', (req, res) => {
    res.send('Hello World!')
})

const zipFileName = 'temp.zip'
const unpackDirectory = 'temp'
const resolvedUnpackPath = resolve(unpackDirectory);

const readMessagesDir = (path, callback) => {
    fs.readdir(path, (err, dirs) => {
        console.log(dirs)
        if (dirs.indexOf('messages') !== -1) {
            callback(path + '/messages')
        } else {
            readMessagesDir(path + '/' + dirs[0], callback)
        }
    })
}

app.post('/upload', (req, res) => {
    fs.writeFile(zipFileName, req.files.file.data, "binary", (err) => {
        if (err) {
            console.log(err);
        } else {
            console.log("The file was saved!");

            extract(zipFileName, {dir: resolvedUnpackPath}, (err) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log('File unzipped')
                    readMessagesDir(resolvedUnpackPath, (messageDir) => {
                        console.log('Message dir', messageDir)
                        fs.readdir(messageDir, (err, files) => {
                            if (err) {
                                console.error("Could not list the directory.", err);
                                process.exit(1);
                            }

                            let promises = getReadAllMessageFilesAsPromises(files, messageDir)

                            Promise.all(promises).then(data => {
                                console.log('All finished', data)
                                fs.unlink(zipFileName, (err) => {
                                    if (err) throw err;
                                    console.log(zipFileName + 'was deleted');
                                });
                                rimraf(resolvedUnpackPath, () => {
                                    console.log('done')
                                });
                                res.setHeader('Content-Type', 'application/json')
                                res.setHeader('Access-Control-Allow-Origin', '*')
                                res.send(JSON.stringify(data))
                            })
                        })
                    })
                }
            })
        }
    });
});

const getReadAllMessageFilesAsPromises = (files, messagesDirectory) => {
    let promises = []
    files.forEach(file => {
        promises.push(fs.readFileAsync(messagesDirectory + '/' + file, 'utf8').then((data) => {
            return parseMessageFileContent(data)
        }))
    })
    return promises
}

const parseMessageFileContent = (fileContent) => {
    let messageDataRegex = /(<div class="message">[\S\s]*?<\/div>[^<\/div>]*<\/div>)/g
    let yearRegex = /(?:^|\s)(\d{4})(?:\s|$)/
    let messageCountByYears = {}
    let messageMatch
    while (messageMatch = messageDataRegex.exec(fileContent)) {
        const year = yearRegex.exec(messageMatch[1])[1]
        messageCountByYears[year] ? messageCountByYears[year].count += 1 : messageCountByYears[year] = {
            year: year,
            count: 1
        }
    }

    let finalMessagesCountByYear = []
    Object.keys(messageCountByYears).map(function (key, index) {
        finalMessagesCountByYear.push({year: key, count: messageCountByYears[key].count})
    });

    const messagePartner = fileContent.substring(fileContent.indexOf('<title>') + '<title>'.length + 1, fileContent.indexOf('</title>'))
        .split(' ').slice(2).join(' ')
    const totalMessageCount = (fileContent.match(/<div class="message">/g) || []).length;
    return {
        messagePartner: messagePartner,
        totalMessageCount: totalMessageCount,
        messageCountByYears: finalMessagesCountByYear
    }
}


app.listen(process.env.PORT || 3000, function () {
    console.log('Example app listening on port 3000!')
})