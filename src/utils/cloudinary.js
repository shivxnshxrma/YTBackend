import { v2 as cloudinary } from "cloudinary";
import fs from "fs"

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath)=>{
    try {
        if(!localFilePath) return null;
        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:"auto"
        })
        //file has been uploaded successfully
        // console.log("File is uploaded on cloudinary: ", response.url);
        fs.unlinkSync(localFilePath)
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null
    }
}


const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return null;

        // The resource_type is usually 'image' by default
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: "image"
        });
        
        return result;
    } catch (error) {
        console.log("Error deleting from Cloudinary:", error);
        return null;
    }
}

const getPublicIdFromUrl = (url) => {
    if (!url) return null;
    
    // Regex matches everything after the last '/' of the upload path and before the file extension
    // Example: http://res.cloudinary.com/.../upload/v1234/folder/myImage.jpg
    // We want: folder/myImage
    
    const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/;
    const match = url.match(regex);
    
    return match ? match[1] : null; 
}

export {uploadOnCloudinary,deleteFromCloudinary,getPublicIdFromUrl}