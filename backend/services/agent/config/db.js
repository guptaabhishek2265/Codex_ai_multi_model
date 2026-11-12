import mongoose from 'mongoose'
export default async function connectDb() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
    console.log('Database connected')
}