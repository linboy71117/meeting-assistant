import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyCS3IcQlk3owcdJFlxPlB9F8wC48K6g0FY");

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Hello!");
    console.log("成功：", await result.response.text());
  } catch (err) {
    console.error("API ERROR：", err);
  }
}

test();
