const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const interviewReportSchema = z.object({
    matchScore: z.number().min(0).max(100),

    technicalQuestions: z.array(
        z.object({
            question: z.string(),
            intention: z.string(),
            answer: z.string(),
        })
    ),

    behavioralQuestions: z.array(
        z.object({
            question: z.string(),
            intention: z.string(),
            answer: z.string(),
        })
    ),

    skillGaps: z.array(
        z.object({
            skill: z.string(),
            severity: z.enum(["low", "medium", "high"]),
        })
    ),

    preparationPlan: z.array(
        z.object({
            day: z.number(),
            focus: z.string(),
            tasks: z.array(z.string()),
        })
    ),

    title: z.string().describe("The title of the job for which the interview report is generated"),
});

// Native Gemini API schema definition
const interviewReportGeminiSchema = {
    type: Type.OBJECT,
    properties: {
        title: {
            type: Type.STRING,
            description: "The title of the job for which the interview report is generated",
        },
        matchScore: {
            type: Type.INTEGER,
            description: "A match score percentage between 0 and 100 based on fit",
        },
        technicalQuestions: {
            type: Type.ARRAY,
            description: "10 technical questions with intention and model answer tailored to the resume and JD",
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    intention: { type: Type.STRING },
                    answer: { type: Type.STRING },
                },
                required: ["question", "intention", "answer"],
            },
        },
        behavioralQuestions: {
            type: Type.ARRAY,
            description: "5 behavioral questions with intention and STAR-format answer",
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    intention: { type: Type.STRING },
                    answer: { type: Type.STRING },
                },
                required: ["question", "intention", "answer"],
            },
        },
        skillGaps: {
            type: Type.ARRAY,
            description: "Identified skill gaps between candidate profile and job requirements",
            items: {
                type: Type.OBJECT,
                properties: {
                    skill: { type: Type.STRING },
                    severity: {
                        type: Type.STRING,
                        enum: ["low", "medium", "high"],
                    },
                },
                required: ["skill", "severity"],
            },
        },
        preparationPlan: {
            type: Type.ARRAY,
            description: "7-day preparation roadmap with focus areas and concrete action tasks",
            items: {
                type: Type.OBJECT,
                properties: {
                    day: { type: Type.INTEGER },
                    focus: { type: Type.STRING },
                    tasks: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                },
                required: ["day", "focus", "tasks"],
            },
        },
    },
    required: [
        "title",
        "matchScore",
        "technicalQuestions",
        "behavioralQuestions",
        "skillGaps",
        "preparationPlan",
    ],
};

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription,
}) {
    const prompt = `
You are an expert technical interviewer, career strategist, and hiring manager.
Generate a deeply personalized interview report using the candidate and job information provided.

RESUME:
${resume || "Not provided"}

CANDIDATE'S SELF DESCRIPTION:
${selfDescription || "Not provided"}

JOB DESCRIPTION:
${jobDescription}

Requirements:
- title: Derivation of the exact job title from the job description.
- matchScore: Integer 0 to 100 evaluating the candidate's alignment with the role.
- technicalQuestions: 10 targeted technical interview questions probing candidate's projects, core concepts, and potential gaps for this role, each with 'question', 'intention', and a strong 'answer'.
- behavioralQuestions: 5 behavioral questions tailored to this role using the STAR method, each with 'question', 'intention', and 'answer'.
- skillGaps: List of skills required by the job that the candidate lacks or needs strengthening on, with severity ('low', 'medium', 'high').
- preparationPlan: Exactly 7 days (day 1 through 7) of actionable daily preparation tasks.
`;

    // Try gemini-3.5-flash-lite first (blazing fast ~3s and high availability), fallback to gemini-3.5-flash
    const models = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
    let response = null;
    let lastError = null;

    for (const model of models) {
        try {
            response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: interviewReportGeminiSchema,
                },
            });

            if (response?.text) break;
        } catch (err) {
            console.warn(`Model ${model} failed, trying fallback. Error:`, err.message);
            lastError = err;
        }
    }

    if (!response || !response.text) {
        throw lastError || new Error("The AI returned an empty response.");
    }

    const parsedJSON = JSON.parse(response.text);
    const report = interviewReportSchema.parse(parsedJSON);

    return report;
}

async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                bottom: "20mm",
                left: "15mm",
                right: "15mm",
            },
        });

        return pdfBuffer;
    } finally {
        await browser.close();
    }
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const prompt = `
Generate a tailored, ATS-friendly, 1-2 page HTML resume for a candidate using the details below.

Resume: ${resume || "Not provided"}
Self Description: ${selfDescription || "Not provided"}
Job Description: ${jobDescription}

Requirements:
- Return a JSON object with a single key "html" containing a complete, self-contained HTML document (with inline <style> CSS using system fonts like Arial, Calibri, or Georgia—do NOT use external CDN links).
- Keep the tone authentic, concise, and human-written, tailored directly to the job description.
- Use clean, professional styling that fits nicely on 1-2 A4 pages when printed to PDF.
`;

    const models = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
    let response = null;
    let lastError = null;

    for (const model of models) {
        try {
            response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            html: {
                                type: Type.STRING,
                                description: "Complete self-contained HTML document of the tailored resume",
                            },
                        },
                        required: ["html"],
                    },
                },
            });
            if (response?.text) break;
        } catch (err) {
            lastError = err;
        }
    }

    if (!response || !response.text) {
        throw lastError || new Error("The AI returned an empty response for resume HTML.");
    }

    const jsonContent = JSON.parse(response.text);
    const pdfBuffer = await generatePdfFromHtml(jsonContent.html);

    return pdfBuffer;
}

module.exports = { generateInterviewReport, generateResumePdf };
