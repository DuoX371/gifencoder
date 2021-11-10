const express = require('express');
const app = express();
const axios = require('axios');
const PixivApi = require('pixiv-api-client');
const pixiv = new PixivApi();
const AdmZip = require('adm-zip');
const GIFEncoder = require('gif-encoder-2');
const { createCanvas, loadImage, Image } = require('canvas')

const { initializeApp, getApp } = require("@firebase/app");
const{ getStorage, ref, uploadBytesResumable, getDownloadURL } = require("@firebase/storage");

const firebaseConfig = {
	apiKey: `${process.env.APIKEY}`,
	storageBucket: `${process.env.STORAGE_BUCKET}`
};
const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

const PORT = process.env.port | 80;
let conf = {responseType: "arraybuffer",headers:{"Referer": `https://www.pixiv.net`,}};

app.get('/', async function(req, res){
  res.sendStatus(200);
});

app.get('/gif/encode', async function(req, res) {
	if(req.query['id'] && req.query['w'] && req.query['h']){
		let id = req.query['id']
		let width = req.query['w'];
		let height = req.query['h']
		console.log(width,height);
		console.log(id);
		getDownloadURL(ref(storage, `${id}.gif`))
			.then(async (url) => {
				return res.status(200).send({url: url});
				})
				.catch(async (error) => {
					console.log(error);
					await pixiv.refreshAccessToken(`${process.env.REFRESH_TOKEN}`)
					const dataU = await pixiv.ugoiraMetaData(`${id}`)
					const ugoira = dataU.ugoira_metadata
					const imageZip = ugoira.zip_urls.medium

					const zipData = await axios.get(imageZip,conf)

					const zip = new AdmZip(zipData.data)
					const entries = zip.getEntries();
					const canvas = createCanvas(width, height)
					const ctx = canvas.getContext('2d')
					const encoder = new GIFEncoder(width, height);
					encoder.start();
					encoder.setRepeat(0);
					encoder.setDelay(30);
					encoder.setQuality(10);

					console.log(`Rendering ${entries.length} images`);
					for(let entry of entries){
						const buffer = entry.getData();
						console.log(entry.name);
						const img = new Image;
						img.src = buffer;
						ctx.drawImage(img, 0, 0, width, height);
						encoder.addFrame(ctx);
					}
					encoder.finish();
					const gifBuffer = encoder.out.getData();

					const storageRef = ref(storage, `${id}.gif`);
					const uploadTask = uploadBytesResumable(storageRef, gifBuffer, {
						contentType: 'image/gif',
					});
					uploadTask.on('state_changed',
					(snapshot) => {
						// Observe state change events such as progress, pause, and resume
						// Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
						const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
						console.log('Upload is ' + progress + '% done');
						switch (snapshot.state) {
							case 'paused':
							console.log('Upload is paused');
							break;
							case 'running':
							console.log('Upload is running');
							break;
						}
					},
					(error) => {
						return res.status(500).send({err: "and error has occured"});
					},
					() => {
						// Handle successful uploads on complete
						// For instance, get the download URL: https://firebasestorage.googleapis.com/...
						getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
								console.log('File available at', downloadURL);
								return res.status(200).send({url: downloadURL});
							});
						}
					);
				});

	}else{
		return res.status(500).send("Invalid ID");
	}
});


app.listen(PORT, ()=>console.log(`Web > Running at port ${PORT}`));
