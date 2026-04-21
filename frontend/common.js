const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.AppConfig = {
  API_BASE: isLocalHost ? 'http://localhost:3333' : 'https://grimorio-backend.onrender.com',
  SUPABASE_URL: 'https://mykzgxpreyqppvzjmwtm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15a3pneHByZXlxcHB2emptd3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTI4NzQsImV4cCI6MjA5MTI2ODg3NH0.UfCIO5VXfaMbRP6byOl7FjuRy3JRIMqfqv7kdjd25R8',
};

window.AppUtils = {
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
