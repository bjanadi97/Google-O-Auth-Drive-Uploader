const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const {google} = require('googleapis');
const multer = require('multer');
const fs = require('fs');
const formidable = require('formidable');
const credentials = require('./credentials.json');
var path = require("path");
var success = false;
var Storage = multer.diskStorage({
    destination: function (req, file, callback) {
      callback(null, "./images");
    },
    filename: function (req, file, callback) {
      callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
    },
  });
var upload = multer({
    storage: Storage,
  }).single("file"); 


const storage = require('node-sessionstorage')
const client_id =credentials.web.client_id;
const client_secret = credentials.web.client_secret;
const redirect_uris = credentials.web.redirect_uris;
const oAuth2Client = new google.auth.OAuth2(client_id,client_secret, redirect_uris[0]);
const url = "";
const SCOPE = ['https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file']
var authed= false;
app.use(cors());
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');


app.get('/', function(req,res){

    res
    .status(200)
    .sendFile(path.join(__dirname, "public","index.html"));    
});

app.get('/getAuthorizationURL', (req,res) => {
   
   const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPE,
   });
    res.redirect(authUrl);  
});

app.get('/google/callback', (req,res) => {
    const code = req.query.code

    if(code){
        oAuth2Client.getToken(code, function(err,token) {
            if(err){
                console.log('Error retrieving access token', err);
            }
            else{
                console.log('Successfully authenticated');
                oAuth2Client.setCredentials(token);
                authed = true;
                res.redirect('/fileUploadPage');
                storage.setItem('accessToken', token.access_token);
            }
        })
    }   
})

app.get('/fileUploadPage', function(req,res){

    if(authed){
        if(storage.getItem('accessToken') == null){
            console.log("No token yet");
        }
        else{
            var oauth2 = google.oauth2({
                auth: oAuth2Client,
                version: "v2",
              });

              oauth2.userinfo.get(function (err, response) {
                if (err) {
                  console.log(err);
                } else {
                  name = response.data.name
                  pic = response.data.picture
                  success = false
                }
                  res.render('fileupload', { title: name, picture: pic , success: success  })               
              });
        }   
    }
    else{
        res
        .status(200)
        .sendFile(path.join(__dirname, "public","index.html"));
    }  
},);


app.get('/logout',(req,res) => {
  authed = false
  res.redirect('/')
})


app.post("/uploadToDrive", (req, res) => {
    upload(req, res, function (err) {
      if (err) {
        console.log(err);
        return res.end("Something went wrong");
      } else {
        console.log(req.file);
        const drive = google.drive({ version: "v3",auth:oAuth2Client  });
        const fileMetadata = {
          name: req.file.filename,
        };
        const media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path),
        };
        drive.files.create(
          {
            resource: fileMetadata,
            media: media,
            fields: "id",
          },
          (err, file) => {
            if (err) {
              console.error(err);
            } else {
              fs.unlinkSync(req.file.path)
            
              // res.render('fileupload', { success: success  })    
              
              var oauth2 = google.oauth2({
                auth: oAuth2Client,
                version: "v2",
              });

              oauth2.userinfo.get(function (err, response) {
                if (err) {
                  console.log(err);
                } else {
                  name = response.data.name
                  pic = response.data.picture
                  success = true
                }
                  res.render('fileupload', { title: name, picture: pic , success: success  })               
              });
            }
  
          }
        );
      }
    });
  });
  


  app.post('/DriveFileUpload', (req, res) => {
    var form = new formidable.IncomingForm();
    form.parse(req, (err, fields, files) => {
        if (err) return res.status(400).send(err);
        const token = JSON.parse(fields.token);
        console.log(token)
        if (token == null) return res.status(400).send('Token not found');
        oAuth2Client.setCredentials(token);
        console.log(files.file);
        const drive = google.drive({ version: "v3", auth: oAuth2Client });
        const fileMetadata = {
            name: files.file.name,
        };
        const media = {
            mimeType: files.file.type,
            body: fs.createReadStream(files.file.path),
        };
        drive.files.create(
            {
                resource: fileMetadata,
                media: media,
                fields: "id",
            },
            (err, file) => {
                oAuth2Client.setCredentials(null);
                if (err) {
                    console.error(err);
                    res.status(400).send(err)
                } else {
                    res.send('Successful')
                }
            }
        );
    });
});


app.post('/readDriveFiles', (req,res) => {
    if(req.body.token == null) return res.status(400).send('Token Not Found');
    oAuth2Client.setCredentials(req.body.token);

    const drive = google.drive({version:'v3', auth: oAuth2Client});
    drive.files.list({
        pageSize:10,
    }, (err, response) => {
        if(err){
            console.log('API returned an error: ' + err);
            return res.status(400).send(err);
        }
        const files = response.data.files;
        if(files.length){
            console.log('Files: ');
            files.map((file) => {
                console.log(`${file.name} (${file.id})`);
            });
        }
        else{
            console.log('No Files found');
        }
        res.send(files);
    })
})

app.post('/deleteDriveFile/:id', (req, res) => {
    if (req.body.token == null) return res.status(400).send('Token not found');
    oAuth2Client.setCredentials(req.body.token);
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    var fileId = req.params.id;
    drive.files.delete({ 'fileId': fileId }).then((response) => { res.send(response.data) })
});


app.post('/download/:id', (req, res) => {
    if (req.body.token == null) return res.status(400).send('Token not found');
    oAuth2Client.setCredentials(req.body.token);
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    var fileId = req.params.id;
    drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' },
        function (err, response) {
       
        response.data
            .on('end', () => {
                console.log('Done');
            })
            .on('error', err => {
                console.log('Error', err);
            })
            .pipe(res);            
        });

});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Started in PORT ${PORT}`));

