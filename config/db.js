import mongoose from "mongoose";

export const connectDB = async () =>{
    await mongoose.connect('mongodb+srv://daminirudru_db_user:Y4uKpfSONIb18gkH@cluster0.scwpopy.mongodb.net/Realcafeteria?retryWrites=true&w=majority&appName=cluster0').then(()=>{
       console.log('DB connected') ;
    })
}