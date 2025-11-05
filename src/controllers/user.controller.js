import { apiError } from '../utils/apiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {apiResponse} from '../utils/apiResponse.js'
const registerUser = asyncHandler(async(req,res)=>{
    const{userName,fullName,email,password} =req.body
    if([userName,fullName,email,password].some((field)=> field?.tirm()==="")){
        throw new apiError(400,"All fields are required!")
    }
    const existingUser = User.findOne({
        $or: [{userName},{email}]
    })
    if(existingUser) throw new apiError(400,"User with this email or Username already exists!")
    
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if(!avatarLocalPath) throw new apiError(400,"Avatar field is required!")
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar) throw new apiError(400,"Avatar field is required!")
    const user = await User.create({
        fullName,
        avatar:avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        userName:userName.toLowerCase()
    })
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser) throw new apiError(500,"Something went wrong while registering the user!")
    return res.status(201).json(
        new apiResponse(200,createdUser,"User registered successfully!")
    )
    })

export {registerUser}