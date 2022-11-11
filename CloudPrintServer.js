const http = require("http");
const net = require("net-socket");
const webSocket = require("ws");

const host = "172.17.11.82";
var client = "172.17.11.120";
// const host = '172.17.11.82';
// const host = 'localhost';

const port1 = 3030;
const port2 = 3031;
const port3 = 59630;

const fs = require("fs");
const formidable = require("formidable");
var path = require("path");
var express = require("express");
const { url } = require("inspector");
const { Socket } = require("dgram");
const axios = require("axios").create({
  baseUrl: "https://jsonplaceholder.typicode.com/",
});
var app1 = express();
var app2 = express();
var app3 = express();

var router = express.Router();
const StringDecoder = require("string_decoder").StringDecoder;

var printJobCompleted = false;
var printJobFail = true;
var timeout;
var offlineTimeout;
var isDeleting = false;
var fileSizeError = false;
var requireResend = false;
var errorStatus;
var isPrinterConnected = false;
var counter = 0;
var ignoreFirstPostRequest = true;

//Server upload file dir
const directoryPath = path.join(__dirname, "uploads/");
const scriptPath = path.join(__dirname, "scripts/");
const displayPath = path.join(__dirname, "display/");

//CORS
app1.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "*");
  next();
});
app2.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "*");
  next();
});
app3.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

//Check http method
app1.use(function (req, res, next) {
  console.log("/" + req.method);
  // console.log(req.socket.remoteAddress);
  client = req.socket.remoteAddress;
  next();
});

//Do nothing
app1.get("/", function (req, res) {
  res.json({ message: "Hello World" });
});

//Get print job list
app1.get("/Data/", function (req, res) {
  var list = [];

  fs.readdir(directoryPath, function (err, files) {
    if (err) {
      res.json("Unable to scan directory: " + err);
    }

    function printJobData(no, fileName, time, status) {
      (this.No = no),
        (this.FileName = fileName),
        (this.Time = time),
        (this.Status = status);
    }
    function getDateTime(savedTime) {
      let year = savedTime.substring(0, 4);
      let month = savedTime.substring(4, 6);
      let day = savedTime.substring(6, 8);
      let hour = parseInt(savedTime.substring(8, 10)) + 8;
      let min = savedTime.substring(10, 12);
      let sec = savedTime.substring(12, 14);
      savedTime = `Date: ${year}-${month}-${day}  Time: ${
        hour == 24
          ? (hour = "00")
          : hour > 24
          ? hour - 24 < 10
            ? "0" + hour - 24
            : hour - 24
          : hour < 10
          ? "0" + hour
          : hour
      }:${min}:${sec}`;

      return savedTime;
    }
    for (var index = 0; index < files.length; index++) {
      let showFileName = files[index].substring(
        files[index].indexOf("_FileName_") + 10
      );
      let savedTime = files[index].substring(
        0,
        files[index].indexOf("_FileName_")
      );
      list.push(
        new printJobData(
          index + 1,
          showFileName,
          getDateTime(savedTime),
          !ignoreFirstPostRequest && isPrinterConnected
            ? !index
              ? !printJobFail
                ? requireResend
                  ? errorStatus
                  : isDeleting
                  ? "Deleting"
                  : "In progress"
                : "Timeout Failed"
              : "Pending"
            : "No connection to printer"
        )
      );

      // list.push(new printJobData(index + 1, showFileName, getDateTime(savedTime), !index ? (!printJobFail ? (requireResend ? errorStatus : (isDeleting ? "Deleting" : "In progress")) : "Timeout Failed") : "Pending"));
    }
    res.json(list);
  });
});

//Save file to server
app1.post("/file/", function (req, res) {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, file) {
    try {
      if (file.file.size > 0) {
        //temp file88
        var filePath = file.file.filepath;

        //new path
        var newPath = directoryPath;
        var dt = new Date().toISOString().split(".")[0].replace(/[^\d]/gi, "");
        var newname = dt + "_FileName_" + file.file.originalFilename;
        newPath += newname;

        fs.rename(filePath, newPath, function () {
          console.log("Upload success");
          res.status(200).end();
        });
      }
    } catch (error) {
      console.log("No file is uploaded");
      res.status(200).end();
    }
  });
});

//Save data to server
app1.post("/data/", function (req, res) {
  let decoder = new StringDecoder("utf-8");
  let buffer = "";
  req.on("data", function (chunck) {
    buffer += decoder.write(chunck);

    buffer = JSON.parse(buffer).data;

    var newPath = directoryPath;
    var dt = new Date().toISOString().split(".")[0].replace(/[^\d]/gi, "");
    var fileName = dt + "_FileName_OrderReceipt.bin";
    newPath += fileName;

    fs.writeFile(newPath, buffer, function (err) {
      if (err) {
        return console.log("create fail");
      }
      console.log("create success");
    });

    buffer += decoder.end;
    res.status(200).end();
  });
});

app1.delete("/:id", function (req, res) {
  console.log("user wants to delete this file");

  //If the file is not reading
  if (
    isPrinterConnected ||
    (printJobFail && req.params.id == 0) ||
    req.params.id > 1 ||
    (req.params.id > 0 && !printJobCompleted)
  ) {
    //Get files
    const files = fs.readdirSync(directoryPath);

    fs.unlink(directoryPath + files[req.params.id], (err) => {
      if (err) {
        console.log("Delete file failed!");
        res.status(200).end();
      } else {
        console.log("Delete file successful!");
        printJobFail = false;
        res.status(200).end();
      }
    });
  } else {
    console.log("Not able to delete!");
    res.status(200).end();
  }
});

app1.post("/:status?", function (req, res) {
  console.log(counter);

  printJobFail = false;
  // isPrinterConnected=true;

  let decoder = new StringDecoder("utf-8");
  let buffer = "";

  // buffer.end should be called after data is retrieved

  //   req.on("data", function (chunck) {
  //     buffer += decoder.write(chunck);

  //     buffer = JSON.parse(buffer).data;

  //     fs.writeFile(newPath, buffer, function (err) {
  //       if (err) {
  //         return console.log("create fail");
  //       }
  //       console.log("create success");
  //     });

  //     buffer += decoder.end;
  //     res.status(200).end();
  //   });

  req.on("data", function (chunck) {
    buffer += decoder.write(chunck);
    buffer += decoder.end;
    buffer = buffer.substring(buffer.indexOf("[") + 1).substring(0, 14);

    if (counter > 0) {
      ignoreFirstPostRequest = false;
    }

    try {
      //Response to printer

      // var isDeleting = false;
      // printJobFail = false;
      clearTimeout(timeout);
      //Create timeout timer
      timeout = setTimeout(() => {
        printJobFail = true;
        counter = 0;
        ignoreFirstPostRequest = true;
      }, 10000);
      // isPrinterConnected=true;
      clearTimeout(offlineTimeout);
      offlineTimeout = setTimeout(() => {
        isPrinterConnected = false;
        counter = 0;
        ignoreFirstPostRequest = true;
      }, 30000);

      //Get files
      const files = fs.readdirSync(directoryPath);

      //delete speed too fast, client side cnt see
      //fix bigger file size http issue (reload printer config needed)

      var binaryRTS = [];
      const decimalRTS = buffer.split(",");

      if (decimalRTS.length > 0) {
        //if length is longer, then direct print barcode from scanned data
        // const scriptFiles = fs.readdirSync(scriptPath);
        // let scriptbinary = fs.readFileSync(scriptFiles + files[0]);
        // let numOfChuncks = Math.ceil(Buffer.byteLength(scriptbinary) / 1000);
        // let chunck = splitArrayIntoChunksOfLen(scriptbinary, 1000);

        // var newPath = directoryPath;
        // var dt = new Date().toISOString().split(".")[0].replace(/[^\d]/gi, "");
        // var fileName = dt + "_FileName_OrderReceipt.bin";
        // newPath += fileName;

        // fs.writeFile(newPath, buffer, function (err) {
        //   if (err) {
        //     return console.log("create fail");
        //   }
        //   console.log("create success");
        // });

        decimalRTS.forEach((status) => {
          status = status.replace(/[\])}[{(]/g, "");

          binaryRTS.push(
            ("00000000" + parseInt(status, 16).toString(2)).substr(-8)
          );
        });
        // console.log(binaryRTS);
      }

      //Delete completed print job (previous print job complete + printer status ok)
      if (
        (binaryRTS.length > 0 ? checkPrinterStatus(binaryRTS) : false) &&
        printJobCompleted
      ) {
        // if (printJobCompleted) {
        // console.log("Deleting file....");
        isDeleting = true;
        fs.unlink(directoryPath + files[0], (err) => {
          if (err) {
            isDeleting = false;
            console.log("Delete file failed!");
            res.status(200).end();
            // res.status(400).end();
          } else {
            isDeleting = false;
            console.log("Delete file successful!");
          }
        });
      }

      printJobCompleted = false;

      if (
        counter > 1 &&
        checkPrinterStatus(binaryRTS) &&
        !isDeleting &&
        !requireResend &&
        isPrinterConnected
      ) {
        // if (!isDeleting && checkPrinterStatus(binaryRTS)) {

        //Retrieve print job
        if (files.length) {
          let binary = fs.readFileSync(directoryPath + files[0]);
          let numOfChuncks = Math.ceil(Buffer.byteLength(binary) / 1000);
          let chunck = splitArrayIntoChunksOfLen(binary, 1000);

          console.log(numOfChuncks);
          // console.log(Buffer.byteLength(binary));
          // console.log(http.maxHeaderSize);

          res.set({
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(binary),
          });

          // // load printer config page before printing
          // app1.get("/promise", (req, res) => {
          //     axios({
          //         url: "http://172.17.11.207",
          //         method: "get",
          //     })
          //         .then(response => {
          //             console.log("reload printer web config success")
          //             res.status(200).json(response.data);
          //         })
          //         .catch((err) => {
          //             console.log("reload printer web config failed")
          //             res.status(500).json({ message: err });
          //         })
          // });

          // res.send(binary);

          //Send data to printer
          for (var index = 0; index < numOfChuncks; index++) {
            // res.writeHead(200, {
            //     'Content-Type': 'application/json',
            //     'Content-Length': Buffer.byteLength(chunck[index]),
            // });

            // res.set({
            //     'Content-Type': 'application/json',
            //     'Content-Length': Buffer.byteLength(chunck[index]),

            // });

            let result = res.write(chunck[index]);
            console.log(result);
            console.log(chunck[index]);
            if (!result) {
              console.log(index + " : Chunck transfer failed!!!!!!");
              fileSizeError = true;
              break;
            } else {
              console.log(index + " : Chunck transfer success!");
              if (index == numOfChuncks - 1) {
                printJobCompleted = true;
                // requireResend = false;  //check if printer has error, if yes then resend is required
                console.log("Ready to delete file");
                // res.status(200).end();
                // console.log("done");
              }
            }
          }
        }
      }
      // console.log("ended");

      if (counter > 5) {
        counter = 2;
      } else {
        counter++;
        isPrinterConnected = true;
      }

      if (fileSizeError) {
        fileSizeError = false;
        res.status(200).end();
      } else {
        res.status(200).end();
      }
    } catch (error) {
      res.status(200).end();
    }
  });
});

app2.post("/:status?", function (req, res) {
  let decoder = new StringDecoder("utf-8");
  let buffer = "";

  req.on("data", function (chunck) {
    buffer += decoder.write(chunck);
    buffer += decoder.end;
    buffer = buffer.substring(buffer.indexOf("[") + 1).substring(0, 14);

    try {
      //Get files
      const files = fs.readdirSync(directoryPath);

      var binaryRTS = [];
      const decimalRTS = buffer.split(",");

      if (decimalRTS.length > 0) {
        decimalRTS.forEach((status) => {
          status = status.replace(/[\])}[{(]/g, "");

          binaryRTS.push(
            ("00000000" + parseInt(status, 16).toString(2)).substr(-8)
          );
        });

        //if length is longer, then direct print barcode from scanned data
        const scriptFiles = fs.readdirSync(scriptPath);
        let scriptbinary = fs.readFileSync(scriptPath + scriptFiles[1]);
        let numOfChuncks = Math.ceil(Buffer.byteLength(scriptbinary) / 1000);
        let chunck = splitArrayIntoChunksOfLen(scriptbinary, 1000);

        var newPath = directoryPath;
        var dt = new Date().toISOString().split(".")[0].replace(/[^\d]/gi, "");
        var fileName = dt + "_FileName_mPOSDemoReceipt.bin";
        newPath += fileName;

        fs.writeFile(newPath, scriptbinary, function (err) {
          if (err) {
            return console.log("create fail");
          }
          console.log("create success");
        });
      }
      res.status(200).end();
    } catch (error) {
      res.status(200).end();
    }
  });
});

function getCurrentByte(length) {
  if (length < indexArray) {
    indexArray = 0;
    //delete file
  } else {
    indexArray += 1;
  }
}

function splitArrayIntoChunksOfLen(arr, len) {
  var chunks = [],
    i = 0,
    n = arr.length;
  while (i < n) {
    chunks.push(arr.slice(i, (i += len)));
  }
  return chunks;
}

function checkPrinterStatus(status) {
  //5
  if (status[4].toString()[status[4].length - 3] == 1) {
    console.log("Thermal head failure dots exist!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Thermal head failure dots exist";
    return false;
  } else {
    // console.log("No thermal head failure dots exist!!!!!!");
  }

  //4
  if (
    status[3].toString()[status[3].length - 3] == 1 &&
    status[3].toString()[status[3].length - 4] == 1
  ) {
    // console.log("Paper low!!!");
  } else {
    // console.log("No paper low!!!!!!");
  }
  if (
    status[3].toString()[status[3].length - 6] == 1 &&
    status[3].toString()[status[3].length - 7] == 1
  ) {
    console.log("Paper exhausted or paper jam!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Paper exhausted or paper jam";
    return false;
  } else {
    // console.log("Paper presented and paper no jam!!!!!!");
  }

  //3
  if (status[2].toString()[status[2].length - 4] == 1) {
    console.log("Cutter error!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Cutter error";
    return false;
  } else {
    // console.log("No cutter error!!!!!!");
  }
  if (status[2].toString()[status[2].length - 6] == 1) {
    console.log("Unrecoverable error occurred!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Unrecoverable error occurred";
    return false;
  } else {
    // console.log("No unrecoverable error!!!!!!");
  }
  if (status[2].toString()[status[2].length - 7] == 1) {
    console.log("Automatically recoverable error!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Automatically recoverable error";
    return false;
  } else {
    // console.log("No automatically recoverable error!!!!!!");
  }

  //2
  if (status[1].toString()[status[1].length - 3] == 1) {
    console.log("Cover open!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Cover open";
    return false;
  } else {
    // console.log("Cover closed!!!");
  }
  if (status[1].toString()[status[1].length - 4] == 1) {
    console.log("Feed button pressed!!!");
  } else {
    // console.log("Feed button not pressed!!!!!!");
  }
  if (status[1].toString()[status[1].length - 6] == 1) {
    console.log("Stop printing due to paper low!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Stop printing due to paper low";
    return false;
  } else {
    // console.log("No stop print due to paper low!!!!!!");
  }
  if (status[1].toString()[status[1].length - 7] == 1) {
    console.log("Error condition exist in printer!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "Error condition exist in printer";
    return false;
  } else {
    // console.log("No error condition!!!!!!");
  }

  //1
  if (status[0].toString()[status[0].length - 4] == 1) {
    console.log("offline!!!");
    requireResend = true;
    counter = 0;
    errorStatus = "offline";
    return false;
  } else {
    // console.log("online!!!");
  }

  requireResend = false;
  return true;
}

var sock = net.connect(port3, client);
sock.setEncoding("utf8");
sock.on("connect", function (connection) {
  const files = fs.readdirSync(displayPath);
  let binary = fs.readFileSync(displayPath + files[0]);
  var buf = new Buffer.alloc(1);
  buf.writeUInt8(0x1, 0);
  sock.write(buf);

  sock.write(numberToBytes(Buffer.byteLength(binary)));
  sock.end(binary);
  sock.destroy();
  // sock.end();
});

sock.on("data", (data) => {
  console.log(`Client received: ${data}`);
});
sock.on("data", function (data) {
  buffer += data;
});
sock.on("close", () => {
  console.log("Client closed");

  // net.disconnect();
});
sock.on("error", (err) => {
  console.error(err);
});
sock.on("end", (err) => {
  console.error(err);
  // sock.end();
});
/////

function numberToBytes(number) {
  // you can use constant number of bytes by using 8 or 4
  const len = Math.ceil(Math.log2(number) / 8);
  const byteArray = new Uint8Array(len);

  for (let index = 0; index < byteArray.length; index++) {
    const byte = number & 0xff;
    byteArray[index] = byte;
    number = (number - byte) / 256;
  }

  return byteArray;
}

app1.use("/", router);

const server1 = http.createServer({}, app1).listen(port1, host, function () {
  console.log("Live at Port", port1);
});
const server2 = http.createServer({}, app2).listen(port2, host, function () {
  console.log("Live at Port", port2);
});

// server.keepAliveTimeout = (60 * 1000) + 1000;
// server.headersTimeout = (60 * 1000) + 2000;
