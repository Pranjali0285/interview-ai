import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const generateInterviewReport = async (arg1, selfDescription, jobDescription) => {
  let resumeFile = arg1;
  let selfDesc = selfDescription;
  let jobDesc = jobDescription;

  // Support being called as generateInterviewReport({ resumeFile, selfDescription, jobDescription })
  if (arg1 && typeof arg1 === "object" && !(arg1 instanceof File) && !(arg1 instanceof Blob)) {
    resumeFile = arg1.resumeFile;
    selfDesc = arg1.selfDescription;
    jobDesc = arg1.jobDescription;
  }

  const formData = new FormData();
  if (resumeFile) {
    formData.append("resume", resumeFile);
  }
  if (selfDesc) {
    formData.append("selfDescription", selfDesc);
  }
  if (jobDesc) {
    formData.append("jobDescription", jobDesc);
  }

  const response = await api.post("/api/interview/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getInterviewReportById = async (interviewId) => {
  const response = await api.get(`/api/interview/report/${interviewId}`);
  return response.data;
};

export const getAllInterviewReports = async () => {
  const response = await api.get("/api/interview/");
  return response.data;
};

export const generateResumePdf = async (arg) => {
  const interviewReportId = typeof arg === "object" ? arg.interviewReportId : arg;
  const response = await api.post(
    `/api/interview/resume/pdf/${interviewReportId}`,
    {},
    { responseType: "blob" }
  );
  return response.data;
};
