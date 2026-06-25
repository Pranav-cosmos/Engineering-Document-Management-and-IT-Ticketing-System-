# Engineering Document Management System and IT Ticketing Response System

## Overview

The Engineering Document Management System and IT Ticketing Response System is a full-stack web application developed to streamline engineering document management and IT support workflows. The system combines document management, IT ticket handling, machine learning, and Retrieval-Augmented Generation (RAG) to provide an intelligent platform for managing documents and responding to user queries.

The application allows users to securely upload and manage engineering documents, create and track IT tickets, automatically categorize tickets using machine learning, and interact with uploaded documents through an AI-powered chatbot backed by semantic search.

---

## Features

### Engineering Document Management

* Upload and manage engineering documents.
* Support for PDF, DOCX, and TXT files.
* Document version management.
* Secure document storage using Supabase Storage.
* Role-based document access.

### IT Ticket Management

* Create and manage IT support tickets.
* Ticket status tracking.
* Priority and category management.
* Ticket assignment workflow.
* Automatic ticket categorization using a trained Machine Learning model.

### AI Document Assistant

* Retrieval-Augmented Generation (RAG) chatbot.
* Semantic document search using Google Gemini embeddings.
* Vector similarity search using Supabase pgvector.
* Context-aware responses generated using Gemini 2.5 Flash Lite.
* Immediate indexing of uploaded documents without rebuilding a local vector database.

### Authentication and Authorization

* Supabase Authentication.
* Role-Based Access Control (RBAC).
* Protected routes and role-specific access.

---

## Technology Stack

### Frontend

* React
* Vite
* React Router
* Supabase JavaScript Client

### Backend

* Python
* FastAPI
* Google Gemini API
* Scikit-Learn
* Joblib
* PyMuPDF
* python-docx

### Database

* PostgreSQL (Supabase)
* Supabase Storage
* Supabase Authentication
* pgvector Extension

### AI & Machine Learning

* Gemini Embedding Model (`gemini-embedding-2`)
* Gemini 2.5 Flash Lite
* Retrieval-Augmented Generation (RAG)
* TF-IDF
* Logistic Regression (Ticket Categorization)

---

## Project Architecture

```
React + Vite
        │
        ▼
     FastAPI Backend
        │
 ┌──────┴──────────────┐
 │                     │
 ▼                     ▼
Machine Learning     RAG Pipeline
(Ticket Category)    (Document Chat)
 │                     │
 ▼                     ▼
Scikit-Learn      Gemini Embeddings
                       │
                       ▼
              Supabase pgvector
                       │
                       ▼
               Gemini 2.5 Flash Lite
```

---

## Local Setup

### Prerequisites

* Node.js 18+
* Python 3.10+
* Supabase Project
* Google Gemini API Key

---

## Database Setup

Enable the **pgvector** extension from the Supabase Dashboard.

Execute the SQL migration scripts located in the project:

* `fix_db.sql`
* `pgvector_migration.sql`

These scripts create the required database schema, Row Level Security policies, and vector search functions.

---

## Project Structure

```
Frontend/
├── src/
├── components/
├── pages/
└── lib/

Backend/
├── app.py
├── models/
├── rag/
├── requirements.txt
└── .env
```

---

## Future Enhancements

* Duplicate ticket detection using semantic similarity.
* AI-assisted ticket priority prediction.
* Document summarization.
* OCR support for scanned documents.
* Approval workflows for engineering documents.
* Analytics dashboard.
* Notification and email integration.

---

Developed as part of an Engineering Internship project focused on integrating Artificial Intelligence into Engineering Document Management and IT Service Management workflows.
