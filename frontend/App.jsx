const { useState, useEffect } = React;

const App = () => {
    const [mode, setMode] = useState('filter'); // 'filter' or 'ai'
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState(null);

    // Filter State
    const [industry, setIndustry] = useState('');
    const [location, setLocation] = useState('');
    const [city, setCity] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [companySize, setCompanySize] = useState('');
    const [keywords, setKeywords] = useState('');
    const [totalLeads, setTotalLeads] = useState(10);

    // Country API State
    const [countries, setCountries] = useState([]);
    const [loadingCountries, setLoadingCountries] = useState(false);
    const [countryError, setCountryError] = useState(null);

    // State Dropdown State
    const [stateName, setStateName] = useState('');
    const [states, setStates] = useState([]);
    const [loadingStates, setLoadingStates] = useState(false);
    const [stateError, setStateError] = useState(null);

    // City Dropdown State
    const [cities, setCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [cityError, setCityError] = useState(null);

    const industryOptions = ['Artificial Intelligence', 'FinTech', 'Healthcare', 'SaaS', 'E-Commerce', 'Marketing', 'Real Estate', 'Education', 'Manufacturing', 'Retail', 'Financial Services', 'Hardware'];
    const jobTitleOptions = ['Founder', 'CEO', 'CTO', 'CFO', 'CMO', 'Vice President', 'Director', 'Marketing Manager', 'Product Manager', 'Software Engineer', 'Sales Representative'];
    const sizeOptions = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];

    // AI State
    const [prompt, setPrompt] = useState('');
    const [filtersUsed, setFiltersUsed] = useState(null);

    // Results
    const [leads, setLeads] = useState([]);
    const [count, setCount] = useState(null);
    const [message, setMessage] = useState('');

    const handleLocationChange = async (e) => {
        const selectedCountryName = e.target.value;
        setLocation(selectedCountryName);
        setStateName('');
        setStates([]);
        setCity('');
        setCities([]);

        if (!selectedCountryName) return;

        const selectedCountry = countries.find(c => c.name === selectedCountryName);
        if (!selectedCountry) return;

        setLoadingStates(true);
        setStateError(null);
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/countries/${selectedCountry.iso2}/states`);
            setStates(res.data.states || []);
        } catch (error) {
            setStateError("Unable to load states. Please try again.");
        } finally {
            setLoadingStates(false);
        }
    };

    const handleStateChange = async (e) => {
        const selectedStateName = e.target.value;
        setStateName(selectedStateName);
        setCity('');
        setCities([]);

        if (!selectedStateName) return;

        const selectedCountry = countries.find(c => c.name === location);
        const selectedStateElement = states.find(s => s.name === selectedStateName);
        if (!selectedCountry || !selectedStateElement) return;

        setLoadingCities(true);
        setCityError(null);
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/countries/${selectedCountry.iso2}/states/${selectedStateElement.iso2}/cities`);
            setCities(res.data.cities || []);
        } catch (error) {
            setCityError("Unable to load cities. Please try again.");
        } finally {
            setLoadingCities(false);
        }
    };

    const loadCountries = async () => {
        if (countries.length > 0 || loadingCountries) return;
        setLoadingCountries(true);
        setCountryError(null);
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/countries');
            setCountries(res.data.countries || []);
        } catch (error) {
            setCountryError("Unable to load countries. Please try again.");
        } finally {
            setLoadingCountries(false);
        }
    };

    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => setAlert(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [alert]);

    const showAlert = (message, type) => {
        setAlert({ message, type });
    };

    const handleFilterSubmit = async () => {
        setLoading(true);
        setFiltersUsed(null);
        setLeads([]);
        setCount(null);
        setMessage('');

        try {
            const res = await axios.post('http://127.0.0.1:8000/api/leads', {
                industry,
                location,
                state: stateName,
                city,
                job_title: jobTitle,
                company_size: companySize,
                keywords,
                total_leads: parseInt(totalLeads) || 10,
                page: 1
            });
            setLeads(res.data.leads || []);
            setCount(res.data.count || 0);
            setMessage(res.data.message || '');
        } catch (error) {
            if (!error.response) {
                showAlert("Could not connect to backend.", "red");
            } else {
                showAlert(error.response.data?.detail || "Apollo API error", "red");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAISubmit = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        setFiltersUsed(null);
        setLeads([]);
        setCount(null);
        setMessage('');

        try {
            const res = await axios.post('http://127.0.0.1:8000/api/ai-search', { prompt });
            setLeads(res.data.leads || []);
            setCount(res.data.count || 0);
            setFiltersUsed(res.data.filters_used);
            setMessage(res.data.message || '');
        } catch (error) {
            if (!error.response) {
                showAlert("Could not connect to backend.", "red");
            } else if (error.response.status === 400 || error.response.status === 422) {
                showAlert("Could not parse filters. Try rephrasing.", "yellow");
            } else {
                showAlert(error.response.data?.detail || "Apollo API error", "red");
            }
        } finally {
            setLoading(false);
        }
    };



    const unlockContact = async (index, personId) => {
        if (!personId) {
            showAlert("No Apollo ID found for this contact.", "yellow");
            return;
        }

        // Set specific lead to loading state
        setLeads(currentLeads => {
            const updated = [...currentLeads];
            if (updated[index]) updated[index] = { ...updated[index], unlocking: true };
            return updated;
        });

        try {
            const res = await axios.post('http://127.0.0.1:8000/api/enrich-lead', { person_id: personId });
            const unlockedData = res.data;

            setLeads(currentLeads => {
                const updated = [...currentLeads];
                if (updated[index]) {
                    updated[index] = {
                        ...updated[index],
                        name: unlockedData.name && unlockedData.name !== 'Unknown' ? unlockedData.name : updated[index].name,
                        company: unlockedData.company && unlockedData.company !== 'Unknown Company' ? unlockedData.company : updated[index].company,
                        title: unlockedData.title || updated[index].title,
                        email: unlockedData.email,
                        phone: unlockedData.phone,
                        linkedin_url: unlockedData.linkedin_url,
                        employment_history: unlockedData.employment_history,
                        unlocking: false
                    };
                }
                return updated;
            });
        } catch (error) {
            setLeads(currentLeads => {
                const updated = [...currentLeads];
                if (updated[index]) updated[index] = { ...updated[index], unlocking: false };
                return updated;
            });
            showAlert(error.response?.data?.detail || "Failed to unlock contact", "red");
        }
    };

    const handleDownloadCSV = async () => {
        try {
            const response = await axios({
                url: 'http://127.0.0.1:8000/api/download-csv',
                method: 'GET',
                responseType: 'blob', // Important for handling binary data
            });

            // Create a link to download the file
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'leads_export.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            // Show confirmation popup
            showAlert("Your download is complete", "green");
        } catch (error) {
            showAlert("Failed to download CSV", "red");
        }
    };

    const exportJSON = () => {
        if (leads.length === 0) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(leads, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "leads.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div>
            {alert && (
                <div className={`alert ${alert.type === 'red' ? 'alert-red' : 'alert-yellow'}`}>
                    {alert.message}
                </div>
            )}

            <div className="header">
                <h1 className="title">Lead Extraction System</h1>

                <div className="toggle-container">
                    <button
                        className={`toggle-btn ${mode === 'filter' ? 'active' : ''}`}
                        onClick={() => setMode('filter')}
                    >
                        Filter Mode
                    </button>
                    <button
                        className={`toggle-btn ${mode === 'ai' ? 'active' : ''}`}
                        onClick={() => setMode('ai')}
                    >
                        AI Prompt Mode
                    </button>
                </div>
            </div>

            {mode === 'filter' ? (
                <div className="panel animate-fade-in">
                    <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.25rem' }}>Filter</h2>
                    <div className="grid-2">
                        <div className="form-group">
                            <label>Industry</label>
                            <select className="form-control" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                                <option value="">— Select Industry —</option>
                                {industryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Country</label>
                            <select className="form-control" value={location} onClick={loadCountries} onChange={handleLocationChange}>
                                <option value="">— Select Country —</option>
                                {loadingCountries && <option disabled>Loading countries...</option>}
                                {countryError && <option disabled>{countryError}</option>}
                                {countries.map(c => <option key={c.iso2} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>State</label>
                            <select className="form-control" value={stateName} onChange={handleStateChange} disabled={!location || loadingStates}>
                                <option value="">— Select State —</option>
                                {loadingStates && <option disabled>Loading states...</option>}
                                {stateError && <option disabled>{stateError}</option>}
                                {states.map((s, idx) => <option key={`${s.iso2}-${idx}`} value={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>City</label>
                            <select className="form-control" value={city} onChange={(e) => setCity(e.target.value)} disabled={!stateName || loadingCities}>
                                <option value="">— Select City —</option>
                                {loadingCities && <option disabled>Loading cities...</option>}
                                {cityError && <option disabled>{cityError}</option>}
                                {cities.map((c, idx) => <option key={`${c.name}-${idx}`} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Job Title</label>
                            <select className="form-control" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
                                <option value="">— Any Title —</option>
                                {jobTitleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Company Size</label>
                            <select className="form-control" value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                                <option value="">— Any Size —</option>
                                {sizeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="form-group">
                            <label>Keywords</label>
                            <input type="text" className="form-control" placeholder="e.g. AI startup, SaaS, B2B" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Total Leads</label>
                            <input type="number" min="1" max="100" className="form-control" value={totalLeads} onChange={(e) => setTotalLeads(e.target.value)} />
                        </div>
                    </div>

                    <button className="btn btn-green" onClick={handleFilterSubmit} disabled={loading} style={{ marginTop: '1rem' }}>
                        {loading ? 'Extracting...' : 'Extract Leads'}
                    </button>
                </div>
            ) : (
                <div className="panel animate-fade-in">
                    <div className="info-box">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                        AI will parse your prompt into filters automatically
                    </div>

                    <div className="form-group">
                        <textarea
                            className="form-control"
                            placeholder="e.g. Find founders or CEOs in AI startups with 1–200 employees"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                    </div>

                    <button className="btn btn-blue" onClick={handleAISubmit} disabled={loading}>
                        {loading ? 'Searching...' : 'Search with AI'}
                    </button>

                    {filtersUsed && (
                        <div className="filters-card">
                            <strong>Filters interpreted:</strong>
                            <pre style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap', color: '#4b5563', fontFamily: 'monospace' }}>
                                {JSON.stringify(filtersUsed, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            <div className="results-panel">
                <div className="results-header">
                    <h2>{count !== null ? `${count} Leads Found` : 'Results'}</h2>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {count > 0 && (
                            <button className="btn-export" onClick={exportJSON}>
                                Export JSON
                            </button>
                        )}
                        <button className="btn-export" onClick={handleDownloadCSV} style={{ background: '#f0fdf4', borderColor: '#16a34a', color: '#166534', fontWeight: 'bold' }}>
                            📥 Download DB (CSV)
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="spinner">
                        <div style={{ marginBottom: '1rem' }}>Fetching leads...</div>
                    </div>
                )}

                {!loading && message && count > 0 && (
                    <div style={{
                        padding: '1rem', marginBottom: '1.5rem', borderRadius: '0.5rem', border: '1px solid', fontSize: '0.9rem', fontWeight: '500', textAlign: 'center',
                        background: message.includes('only') ? '#fffbeb' : '#f0fdf4',
                        color: message.includes('only') ? '#92400e' : '#166534',
                        borderColor: message.includes('only') ? '#fcd34d' : '#86efac'
                    }}>
                        {message}
                    </div>
                )}

                {!loading && count === 0 && (
                    <div className="spinner">
                        {message || "No leads found. Try relaxing your filters."}
                    </div>
                )}

                {!loading && leads.length > 0 && (
                    <div className="grid-3 animate-fade-in">
                        {leads.map((lead, index) => (
                            <div key={index} className="lead-card">
                                <div className="lead-name">👤 {lead.name}</div>
                                {lead.title && <div className="lead-title" style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.5rem' }}>💼 {lead.title}</div>}
                                {lead.company && <div className="lead-company">🏢 {lead.company}</div>}
                                <div className={`lead-email ${lead.email && lead.email.includes('Not available') ? 'text-gray' : ''}`}>
                                    ✉️ {lead.email}
                                </div>
                                <div className={`lead-phone ${lead.phone && lead.phone.includes('Not available') ? 'text-gray' : ''}`}>
                                    📞 {lead.phone}
                                </div>

                                <div className="lead-actions" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                    <button
                                        className="btn btn-blue"
                                        style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                                        onClick={() => unlockContact(index, lead.id)}
                                        disabled={lead.unlocking}
                                    >
                                        {lead.unlocking ? 'Unlocking...' : 'Unlock Full Contact Info'}
                                    </button>
                                </div>

                                {lead.linkedin_url && (
                                    <div className="lead-linkedin" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                        🔗 <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>LinkedIn Profile</a>
                                    </div>
                                )}
                                {lead.employment_history && lead.employment_history.length > 0 && (
                                    <div className="lead-employment" style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                                        <strong>Past Roles:</strong>
                                        <ul style={{ margin: '0.2rem 0', paddingLeft: '1.2rem' }}>
                                            {lead.employment_history.slice(0, 2).map((job, idx) => (
                                                <li key={idx}>{job.title} @ {job.organization_name}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="lead-info" style={{ marginBottom: '0.5rem' }}>ℹ️ {lead.about_company || lead.company_info}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
