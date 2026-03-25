import os
import re
import httpx
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

APOLLO_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search"
APOLLO_ENRICH_URL = "https://api.apollo.io/api/v1/people/match"
WEBHOOK_URL       = "https://webhook-test.com/5b112b64ff0f4104d003444e843c161a"


# ── API Key ───────────────────────────────────────────────────────────────────

def get_api_key() -> str:
    dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    try:
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("APOLLO_API_KEY="):
                    return line.strip().split("=", 1)[1].strip()
    except Exception:
        pass
    return os.getenv("APOLLO_API_KEY", "")

def get_csc_api_key() -> str:
    dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    try:
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("CSC_API_KEY="):
                    return line.strip().split("=", 1)[1].strip()
    except Exception:
        pass
    return os.getenv("CSC_API_KEY", "")


# ── Models ────────────────────────────────────────────────────────────────────

class LeadRequest(BaseModel):
    
    industry:     Optional[str] = None
    location:     Optional[str] = None
    state:        Optional[str] = None
    job_title:    Optional[str] = None
    company_size: Optional[str] = None
    keywords:     Optional[str] = None
    city:         Optional[str] = None
    total_leads:  Optional[int] = 10
    page:         int = 1

class AISearchRequest(BaseModel):
    prompt: str

class EnrichRequest(BaseModel):
    person_id: str


# ── Extractors ────────────────────────────────────────────────────────────────

def extract_email(person: dict) -> str:
    # 1. Top-level email
    if person.get("email"):
        return person["email"]
    # 2. Top-level contact_emails array
    for ce in (person.get("contact_emails") or []):
        if ce.get("email"):
            return ce["email"]
    # 3. Nested contact object
    contact = person.get("contact") or {}
    if contact.get("email"):
        return contact["email"]
    # 4. contact.contact_emails array
    for ce in (contact.get("contact_emails") or []):
        if ce.get("email"):
            return ce["email"]
    # 5. Guess from name + domain
    org    = person.get("organization") or {}
    domain = org.get("primary_domain", "")
    first  = (person.get("first_name") or "").lower().strip()
    last   = (person.get("last_name")  or "").lower().strip()
    # if domain and first and last:
    #     return f"{first}.{last}@{domain} ⚠️ guessed"
    return "Not available"


def extract_phone(person: dict) -> str:
    # 1. Top-level phone_numbers array
    for pn in (person.get("phone_numbers") or []):
        number = pn.get("sanitized_number") or pn.get("raw_number") or ""
        if number:
            return number
    # 2. contact.phone_numbers array
    contact = person.get("contact") or {}
    for pn in (contact.get("phone_numbers") or []):
        number = pn.get("sanitized_number") or pn.get("raw_number") or ""
        if number:
            return number
    # 3. Organization fallback
    org = person.get("organization") or {}
    return org.get("sanitized_phone") or org.get("phone") or "Not available"


# ── Apollo enrich (single person) ────────────────────────────────────────────

async def enrich_person(client: httpx.AsyncClient, api_key: str, person_id: str) -> dict:
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type":  "application/json",
        "accept":        "application/json",
        "X-Api-Key":     api_key,
    }
    payload = {
        "id":                     person_id,
        "reveal_personal_emails": True,
        "reveal_phone_number":    False,
        "webhook_url":            WEBHOOK_URL,
    }
    try:
        response = await client.post(APOLLO_ENRICH_URL, headers=headers, json=payload, timeout=15.0)
        print("ENRICH STATUS:", response.status_code)
        if response.status_code == 200:
            person = response.json().get("person", {}) or {}
            print("ENRICH EMAIL:", extract_email(person))
            return person
    except Exception as e:
        print("ENRICH ERROR:", e)
    return {}


# ── Core Apollo search + enrich ───────────────────────────────────────────────

async def fetch_apollo_leads(filters: dict) -> dict:
    api_key = get_api_key()
    headers = {
        "X-Api-Key":    api_key,
        "Content-Type": "application/json" 
    }

    payload = {
        "page":     filters.get("page", 1),
        "per_page": min(filters.get("total_leads", 10), 100)
    }

    if filters.get("job_title"):
        payload["person_titles"] = [filters["job_title"]]
    elif filters.get("job_titles"):
        payload["person_titles"] = filters["job_titles"]

    loc_parts = []
    if filters.get("city"):
        loc_parts.append(filters["city"])
    if filters.get("state"):
        loc_parts.append(filters["state"])
    if filters.get("location"):
        loc_parts.append(filters["location"])
        
    if loc_parts:
        payload["person_locations"] = [", ".join(loc_parts)]

    company_size = filters.get("company_size")
    if company_size:
        parts = company_size.split("-")
        if len(parts) == 2:
            payload["organization_num_employees_ranges"] = [f"{parts[0]},{parts[1]}"]
        elif "+" in company_size:
            payload["organization_num_employees_ranges"] = [f"{company_size.replace('+', '')},1000000"]
    elif "company_size_min" in filters and "company_size_max" in filters:
        payload["organization_num_employees_ranges"] = [
            f"{filters['company_size_min']},{filters['company_size_max']}"
        ]

    tags = []
    if filters.get("industry"):
        tags.append(filters["industry"])
    if filters.get("keywords"):
        tags.extend([k.strip() for k in filters["keywords"].split(",") if k.strip()])
    if tags:
        payload["q_organization_keyword_tags"] = tags

    print("====== APOLLO SEARCH PAYLOAD ======")
    print(payload)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(APOLLO_SEARCH_URL, headers=headers, json=payload, timeout=30.0)
            response.raise_for_status()
            data = response.json()

            raw_people     = data.get("people", [])
            requested_limit = int(filters.get("total_leads") or 10)
            people         = raw_people[:min(requested_limit, len(raw_people))]

            leads = []
            for p in people:
                enriched = await enrich_person(client, api_key, p.get("id", ""))
                merged   = {**p, **enriched}
                org      = merged.get("organization", {}) or {}

                raw_desc    = (
                    org.get("short_description") or
                    org.get("seo_description")   or
                    org.get("description")        or
                    "No company info available"
                )
                about = (raw_desc[:100] + "...") if len(raw_desc) > 100 else raw_desc

                leads.append({
                    "id":            p.get("id", ""),
                    "name":          f"{merged.get('first_name','')} {merged.get('last_name','')}".strip() or "Unknown",
                    "title":         merged.get("title", "Unknown Title"),
                    "company":       org.get("name", "Unknown Company"),
                    "email":         extract_email(merged),
                    "phone":         extract_phone(merged),
                    "about_company": about,
                })
            filtered_leads = [
                lead for lead in leads
                if lead.get("email") not in ["", None, "Not available"]
                and lead.get("phone") not in ["", None, "Not available"]
            ]
            
            import csv
            with open("data.csv", "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Name", "Title", "Company", "Email", "Phone", "About Company"])
                for lead in filtered_leads:
                    writer.writerow([
                        lead['name'],
                        lead['title'],
                        lead['company'],
                        lead['email'],
                        lead['phone'],
                        lead['about_company']
                    ])

            return {
                "leads": filtered_leads,
                "count": len(filtered_leads) 
            }


        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Apollo API error: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/leads")
async def get_leads(req: LeadRequest):
    return await fetch_apollo_leads(req.dict())


@app.get("/api/download-csv")
async def download_csv():
    file_path = "data.csv"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="CSV file not found")
    from fastapi.responses import FileResponse
    return FileResponse(file_path, media_type="text/csv", filename="leads_db.csv")


_cached_countries = []

@app.get("/api/countries")
async def get_countries():
    global _cached_countries
    if _cached_countries:
        return {"countries": _cached_countries}
        
    api_key = get_csc_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="CSC_API_KEY not configured. Add it to .env")
        
    headers = {"X-CSCAPI-KEY": api_key}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("https://api.countrystatecity.in/v1/countries", headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            # Extract just name and iso2
            countries = [{"name": c.get("name"), "iso2": c.get("iso2")} for c in data]
            # Sort alphabetically by name
            countries.sort(key=lambda x: x["name"])
            
            _cached_countries = countries
            return {"countries": countries}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")


_cached_states = {}

@app.get("/api/countries/{iso2}/states")
async def get_states(iso2: str):
    global _cached_states
    iso2 = iso2.upper()
    if iso2 in _cached_states:
        return {"states": _cached_states[iso2]}
        
    api_key = get_csc_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="CSC_API_KEY not configured.")
        
    headers = {"X-CSCAPI-KEY": api_key}
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"https://api.countrystatecity.in/v1/countries/{iso2}/states", headers=headers, timeout=10.0)
            if res.status_code == 404:
                return {"states": []}
            res.raise_for_status()
            
            states = [{"name": s.get("name"), "iso2": s.get("iso2")} for s in res.json()]
            states.sort(key=lambda x: x["name"])
            
            _cached_states[iso2] = states
            return {"states": states}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch states: {str(e)}")


_cached_cities = {}

@app.get("/api/countries/{ciso}/states/{siso}/cities")
async def get_state_cities(ciso: str, siso: str):
    global _cached_cities
    ciso = ciso.upper()
    siso = siso.upper()
    cache_key = f"{ciso}-{siso}"
    
    if cache_key in _cached_cities:
        return {"cities": _cached_cities[cache_key]}
        
    api_key = get_csc_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="CSC_API_KEY not configured.")
        
    headers = {"X-CSCAPI-KEY": api_key}
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"https://api.countrystatecity.in/v1/countries/{ciso}/states/{siso}/cities", headers=headers, timeout=15.0)
            if res.status_code == 404:
                return {"cities": []}
            res.raise_for_status()
            
            cities = [{"name": c.get("name")} for c in res.json()]
            cities.sort(key=lambda x: x["name"])
            
            _cached_cities[cache_key] = cities
            return {"cities": cities}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch cities: {str(e)}")


@app.post("/api/ai-search")
async def ai_search(req: AISearchRequest):
    prompt = req.prompt.lower()

    job_titles = []
    if "founder"   in prompt: job_titles.append("Founder")
    if "ceo"       in prompt: job_titles.append("CEO")
    if "cto"       in prompt: job_titles.append("CTO")
    if "marketing" in prompt: job_titles.append("Marketing Manager")
    if "product"   in prompt: job_titles.append("Product Manager")

    industry = ""
    if "ai" in prompt or "artificial intelligence" in prompt: industry = "Artificial Intelligence"
    elif "fintech"                in prompt: industry = "FinTech"
    elif "healthcare"             in prompt: industry = "Healthcare"
    elif "saas"                   in prompt: industry = "SaaS"
    elif "e-commerce" in prompt or "ecommerce" in prompt: industry = "E-Commerce"

    size_match = re.search(r'(\d+)[^\d]*(\d+)', prompt)
    min_s, max_s = (int(size_match.group(1)), int(size_match.group(2))) if size_match else (1, 200)

    filters = {
        "job_titles":       job_titles or ["Founder", "CEO"],
        "industry":         industry,
        "company_size_min": min_s,
        "company_size_max": max_s,
        "page":             1,
    }

    result = await fetch_apollo_leads(filters)
    return {**result, "filters_used": filters}


@app.post("/api/enrich-lead")
async def enrich_lead(req: EnrichRequest):
    api_key = get_api_key()
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type":  "application/json",
        "accept":        "application/json",
        "X-Api-Key":     api_key,
    }
    payload = {
        "id":                     req.person_id,
        "reveal_personal_emails": True,
        "reveal_phone_number":    False,
        "webhook_url":            WEBHOOK_URL,
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(APOLLO_ENRICH_URL, headers=headers, json=payload, timeout=20.0)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Apollo API error: {response.text}")

            person = response.json().get("person", {}) or {}
            org    = person.get("organization", {}) or {}

            print("EMAIL:", extract_email(person))
            print("PHONE:", extract_phone(person))

            return {
                "name":               f"{person.get('first_name','')} {person.get('last_name','')}".strip() or "Unknown",
                "first_name":         person.get("first_name", ""),
                "last_name":          person.get("last_name", ""),
                "title":              person.get("title", ""),
                "company":            org.get("name", "Unknown Company"),
                "email":              extract_email(person),
                "phone":              extract_phone(person),
                "linkedin_url":       person.get("linkedin_url", ""),
                "employment_history": person.get("employment_history", []),
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html")