const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3033;

app.use(express.json());

// ✅ FIX: serve PUBLIC folder properly
app.use(express.static(path.join(__dirname, 'public')));

const DOWNLOAD_DIR = path.join(__dirname,'downloads');

// create downloads folder
if(!fs.existsSync(DOWNLOAD_DIR)){
  fs.mkdirSync(DOWNLOAD_DIR);
  console.log("Created downloads folder");
}

// ✅ FIX: root route
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

console.log("Running http://localhost:"+PORT);



/****************************************
 * LOAD PLAYLIST (ROBUST VERSION)
 ****************************************/
app.post('/playlist',(req,res)=>{

  const { url, limit } = req.body;

  console.log("\n=== LOADING PLAYLIST ===");
  console.log("URL:",url);

  const ytdlp = spawn('yt-dlp',[
    '--dump-json',
    '--playlist-end', limit,
    url
  ]);

  let data = [];

  ytdlp.stdout.on('data',chunk=>{
    const lines = chunk.toString().split('\n');

    lines.forEach(line=>{
      try{
        if(!line) return;

        const json = JSON.parse(line);

        if(json.id && json.title){
          data.push({
            url: json.webpage_url,
            title: json.title,
            thumbnail: json.thumbnail || `https://img.youtube.com/vi/${json.id}/hqdefault.jpg`,
            duration: json.duration_string || 'LIVE'
          });
        }

      }catch(e){}
    });
  });

  ytdlp.stderr.on('data',d=>{
    console.log("[yt-dlp]",d.toString());
  });

  ytdlp.on('close',()=>{
    console.log("Loaded",data.length,"videos");
    res.json(data);
  });

});



/****************************************
 * DOWNLOAD PLAYLIST (PARALLEL)
 ****************************************/
let iteration = 1;

app.post('/download-playlist',(req,res)=>{

  const { list, repeat } = req.body;

  console.log("\n=== START DOWNLOAD ===");
  console.log("Tracks:",list.length);

  function runBatch(){

    console.log("\n=== ITERATION",iteration,"===");

    list.forEach((video,index)=>{

      const output = path.join(
        DOWNLOAD_DIR,
        `%(title)s_${iteration}_${index}.mp3`
      );

      console.log("START:",video.title);

      const ytdlp = spawn('yt-dlp',[
        video.url,
        '--extract-audio',
        '--audio-format','mp3',
        '--audio-quality','192K',
        '--output',output,
        '--newline'
      ]);

      ytdlp.stdout.on('data',d=>{
        console.log(`[${index}]`,d.toString().trim());
      });

      ytdlp.stderr.on('data',d=>{
        console.log(`[${index} ERROR]`,d.toString());
      });

      ytdlp.on('close',code=>{
        console.log(`FINISHED [${index}]`,video.title,"code:",code);
      });

    });

    iteration++;

    if(repeat){
      setTimeout(runBatch,5000);
    }
  }

  runBatch();

  res.json({status:"started"});
});



app.listen(PORT);
