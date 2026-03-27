import csv
import io
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import models

def generate_csv_from_db(db: Session):
    """
    Queries all leads from the database and returns a StreamingResponse 
    of the data in CSV format.
    """
    leads = db.query(models.Lead).all()
    
    # Use a generator to yield CSV rows
    def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header Row
        writer.writerow(["Name", "Title", "Company", "Email", "Phone", "About Company", "Industry", "Country", "State", "City", "Company Size"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for lead in leads:
            phone_val = str(lead.phone or "").strip()
            if phone_val and phone_val != "Not available" and not phone_val.startswith('+'):
                phone_val = f"+{phone_val}"

            writer.writerow([
                lead.name,
                lead.title,
                lead.company_name,
                lead.email,
                phone_val,
                lead.about_company,
                lead.industry,
                lead.country,
                lead.state,
                lead.city,
                lead.company_size
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )
