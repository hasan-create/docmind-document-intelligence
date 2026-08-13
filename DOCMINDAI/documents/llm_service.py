import os

from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


class LLMService:

    model = genai.GenerativeModel("gemini-3.6-flash")

    @staticmethod
    def generate_answer(question, context):

        print("STEP 1: generate_answer() called")

        prompt = f"""
You are a helpful AI assistant.

Answer ONLY using the context below.

If the answer is not present in the context, reply exactly:

I could not find the answer in the uploaded document.

Context:
{context}

Question:
{question}
"""

        print("STEP 2: Prompt created")

        response = LLMService.model.generate_content(prompt)

        print("STEP 3: Gemini responded")

        return response.text