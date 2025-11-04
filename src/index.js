import "dotenv/config"
import connectDB from "./db/index.js";
import app from "./app.js";

connectDB()
.then(()=>{
    app.listen(process.env.PORT,()=>{
        console.log(`App is running on port ${process.env.PORT}`);
    })
    app.on("error",(err)=>{
        console.log("Error :",err);
        throw err
    })
})
.catch((err)=>{
    console.log("DB connection failed :",err);
}) 