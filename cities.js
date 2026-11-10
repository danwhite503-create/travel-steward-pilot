// Built-in city list for the brief's suggestions (D-554's friction list, his phone test).
// Hand-made from public facts (city, state or region, ISO country code); no third-party dataset, so no credit
// line is owed. Short by design: anything not here is typed by hand, as before. Each entry: "City|Region|CC".
window.PILOT_CITIES = [
  // United States: the largest metros and common trip ends
  "New York|NY|US", "Brooklyn|NY|US", "Buffalo|NY|US", "Albany|NY|US", "Rochester|NY|US", "Syracuse|NY|US",
  "Los Angeles|CA|US", "San Francisco|CA|US", "San Diego|CA|US", "San Jose|CA|US", "Oakland|CA|US", "Sacramento|CA|US", "Palm Springs|CA|US", "Santa Barbara|CA|US",
  "Chicago|IL|US", "Houston|TX|US", "Dallas|TX|US", "Austin|TX|US", "San Antonio|TX|US", "Fort Worth|TX|US", "El Paso|TX|US",
  "Phoenix|AZ|US", "Tucson|AZ|US", "Flagstaff|AZ|US", "Philadelphia|PA|US", "Pittsburgh|PA|US",
  "Jacksonville|FL|US", "Miami|FL|US", "Orlando|FL|US", "Tampa|FL|US", "Fort Lauderdale|FL|US", "Key West|FL|US",
  "Columbus|OH|US", "Cleveland|OH|US", "Cincinnati|OH|US", "Indianapolis|IN|US", "Charlotte|NC|US", "Raleigh|NC|US", "Durham|NC|US", "Asheville|NC|US",
  "Seattle|WA|US", "Spokane|WA|US", "Portland|OR|US", "Eugene|OR|US", "Denver|CO|US", "Boulder|CO|US", "Aspen|CO|US",
  "Washington|DC|US", "Boston|MA|US", "Cambridge|MA|US", "Worcester|MA|US", "Providence|RI|US", "Newport|RI|US",
  "Hartford|CT|US", "New Haven|CT|US", "Stamford|CT|US", "Burlington|VT|US", "Portland|ME|US", "Bar Harbor|ME|US",
  "Nashville|TN|US", "Memphis|TN|US", "Louisville|KY|US", "Atlanta|GA|US", "Savannah|GA|US", "Charleston|SC|US",
  "Baltimore|MD|US", "Richmond|VA|US", "Norfolk|VA|US", "Detroit|MI|US", "Grand Rapids|MI|US", "Milwaukee|WI|US", "Madison|WI|US",
  "Minneapolis|MN|US", "Saint Paul|MN|US", "Kansas City|MO|US", "St. Louis|MO|US", "Omaha|NE|US",
  "New Orleans|LA|US", "Las Vegas|NV|US", "Reno|NV|US", "Salt Lake City|UT|US", "Albuquerque|NM|US", "Santa Fe|NM|US",
  "Oklahoma City|OK|US", "Birmingham|AL|US", "Honolulu|HI|US", "Anchorage|AK|US", "Boise|ID|US",
  "Newark|NJ|US", "Jersey City|NJ|US", "Princeton|NJ|US", "Atlantic City|NJ|US", "Wilmington|DE|US", "Greenport|NY|US", "Montauk|NY|US",
  // Canada and Mexico
  "Toronto|Ontario|CA", "Montreal|Quebec|CA", "Quebec City|Quebec|CA", "Ottawa|Ontario|CA", "Vancouver|British Columbia|CA", "Victoria|British Columbia|CA", "Calgary|Alberta|CA", "Halifax|Nova Scotia|CA",
  "Mexico City||MX", "Oaxaca||MX", "Guadalajara||MX", "Cancun||MX", "Mérida||MX",
  // Europe
  "London|England|GB", "Edinburgh|Scotland|GB", "Glasgow|Scotland|GB", "Manchester|England|GB", "Liverpool|England|GB", "Bath|England|GB", "York|England|GB", "Oxford|England|GB", "Cambridge|England|GB", "Bristol|England|GB",
  "Dublin||IE", "Galway||IE", "Cork||IE",
  "Paris||FR", "Lyon||FR", "Marseille||FR", "Nice||FR", "Bordeaux||FR", "Strasbourg||FR", "Lille||FR", "Avignon||FR", "Toulouse||FR",
  "Amsterdam||NL", "Rotterdam||NL", "The Hague||NL", "Utrecht||NL", "Brussels||BE", "Bruges||BE", "Ghent||BE", "Antwerp||BE", "Luxembourg||LU",
  "Berlin||DE", "Munich||DE", "Hamburg||DE", "Frankfurt||DE", "Cologne||DE", "Dresden||DE", "Leipzig||DE",
  "Vienna||AT", "Salzburg||AT", "Innsbruck||AT", "Zurich||CH", "Geneva||CH", "Basel||CH", "Bern||CH", "Lucerne||CH", "Lausanne||CH",
  "Rome||IT", "Milan||IT", "Venice||IT", "Florence||IT", "Naples||IT", "Bologna||IT", "Turin||IT", "Verona||IT", "Genoa||IT", "Palermo||IT", "Pescara||IT", "Bari||IT",
  "Madrid||ES", "Barcelona||ES", "Seville||ES", "Valencia||ES", "Granada||ES", "Bilbao||ES", "San Sebastián||ES", "Málaga||ES",
  "Lisbon||PT", "Porto||PT", "Coimbra||PT", "Faro||PT",
  "Copenhagen||DK", "Aarhus||DK", "Stockholm||SE", "Gothenburg||SE", "Malmö||SE", "Oslo||NO", "Bergen||NO", "Helsinki||FI", "Reykjavik||IS",
  "Prague||CZ", "Budapest||HU", "Kraków||PL", "Warsaw||PL", "Ljubljana||SI", "Zagreb||HR", "Split||HR", "Dubrovnik||HR",
  "Athens||GR", "Thessaloniki||GR", "Istanbul||TR", "Tallinn||EE", "Riga||LV", "Vilnius||LT",
  // Asia, Oceania, the Middle East, Africa, South America
  "Tokyo||JP", "Kyoto||JP", "Osaka||JP", "Hiroshima||JP", "Nara||JP", "Sapporo||JP", "Kanazawa||JP",
  "Seoul||KR", "Busan||KR", "Taipei||TW", "Hong Kong||HK", "Singapore||SG", "Bangkok||TH", "Chiang Mai||TH",
  "Hanoi||VN", "Ho Chi Minh City||VN", "Beijing||CN", "Shanghai||CN", "Delhi||IN", "Mumbai||IN", "Bali||ID",
  "Sydney|New South Wales|AU", "Melbourne|Victoria|AU", "Auckland||NZ", "Queenstown||NZ",
  "Dubai||AE", "Tel Aviv||IL", "Marrakesh||MA", "Cairo||EG", "Cape Town||ZA", "Nairobi||KE",
  "Buenos Aires||AR", "Rio de Janeiro||BR", "São Paulo||BR", "Lima||PE", "Cusco||PE", "Santiago||CL", "Bogotá||CO", "Cartagena||CO"
].map((s) => { const [city, region, cc] = s.split("|"); return { city, region, cc }; });
