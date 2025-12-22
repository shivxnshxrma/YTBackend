import { apiError } from '../utils/apiError.js'
import asyncHandler from '../utils/asyncHandler.js'
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {apiResponse} from '../utils/apiResponse.js'
import jwt from 'jsonwebtoken'

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false})
        return {accessToken,refreshToken}
    } catch (error) {
        throw new apiError(500,"Something went wrong while generating refresh and access token!")
    }
}

const registerUser = asyncHandler(async(req,res)=>{
    const{userName,fullName,email,password} =req.body
    if([userName,fullName,email,password].some((field)=> field?.trim()==="")){
        throw new apiError(400,"All fields are required!")
    }
    const existingUser = await User.findOne({
        $or: [{userName},{email}]
    })
    if(existingUser) throw new apiError(400,"User with this email or Username already exists!")
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length >0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }
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

const loginUser = asyncHandler(async(req,res)=>{
    const {email,userName,password} = req.body;
    if(!(userName || email)){
        throw new apiError(400, "Username or email is required!");
    }
    const user = await User.findOne(
        {
            $or :[{userName},{email}]
        }
    )
    if(!user){
        throw new apiError(404,"User does not exist!");
    }
   const isPasswordValid = await user.isPasswordCorrect(password);
   if(!isPasswordValid){
    throw new apiError(401,"Invalid Login Credentials!");
   }
   const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id);
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
   const options = {
    httpOnly: true,
    secure: true
   }
   return res
   .status(200)
   .cookie("accessToken",accessToken,options)
   .cookie("refreshToken",refreshToken,options)
   .json(
    new apiResponse(200,
        {
            user: loggedInUser,accessToken,refreshToken
        },
        "User Logged In Successfully!"
    )
   )
})

const logoutUser =  asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new apiResponse(200,"User Logged Out Successfully!"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new apiError(401,"Unauthorized!")
    }
   try {
    const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    const user = await User.findById(decodedToken?._id)
    if(!user){
     throw new apiError(401,"Invalid Refresh Token!")
    }
    if(incomingRefreshToken !== user?.refreshToken){
     throw new apiError(401, "Refresh token is expired or used!")
    }
    const options = {
     httpOnly: true,
     secure: true
    }
    const {accessToken,newrefreshToken} = await generateAccessAndRefreshToken(user._id)
    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",newrefreshToken,options)
    .json(
     new apiResponse(
         200,
         {accessToken, refreshToken: newrefreshToken},
         "Access Token Refreshed!"
     )
    )
   } catch (error) {
    throw new apiError(401,error?.message || "Invalid Refresh Token!")
   }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new apiError(400,"Old Password is incorrect!")
    }
    user.password = newPassword
    await user.save({validateBeforeSave:false})
    return res
    .status(200)
    .json(new apiResponse(200,{},"Passwrod Changed Successfully!"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(200,req.user,"Current User Fetched Successfully!")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email} = req.body
    if(!fullName || !email){
        throw new apiError(400,"All Fields are required!")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new apiResponse(200,user,"Account Details Updated Successfully!"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath) throw new apiError(400,"Avatar File is missing!")
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url) throw new apiError(400,"Error while uploading avatar!")
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set :{
                avatar: avatar.url
            }
        },
        {new:true}
    ).select("-password")
    return res
    .status(200)
    .json(new apiResponse(200,user,"Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverLocalPath = req.file?.path
    if(!coverLocalPath) throw new apiError(400,"Cover File is missing!")
    const cover = await uploadOnCloudinary(coverLocalPath)
    if(!cover.url) throw new apiError(400,"Error while uploading Cover Image!")
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set :{
                coverImage: cover.url
            }
        },
        {new:true}
    ).select("-password")
    return res
    .status(200)
    .json(new apiResponse(200,user,"Cover Image updated successfully"))
})
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar
}