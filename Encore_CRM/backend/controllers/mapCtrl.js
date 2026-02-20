const { logError } = require("../logger");
const { handleMongooseError } = require("./common");
const axios = require("axios")

const ROUTES_API_KEY = process.env.GOOGLE_API_KEY;

// Fixed start address (server side)
const FIXED_START = { city: "67 Quantum Cl, Dandenong South VIC 3175, Australia" };

// Helper: geocode single address (limits to AU)
const geocodeAddress = async (address) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:AU&key=${ROUTES_API_KEY}`;
  const res = await axios.get(url);
  const data = res.data;
  if (data.status !== "OK" || !data.results?.length) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng, formatted_address: data.results[0].formatted_address };
}

const computeRoutes = async (req, res) => {
  try {
    const addresses = Array.isArray(req.body.addresses) ? req.body.addresses : [];
    if (!addresses.length) return res.status(400).json({ error: "addresses required" });

    // Geocode fixed start + user addresses
    const fullList = [FIXED_START, ...addresses.filter(address => !address?.city.toLowerCase().includes("pick up") && !address?.city.toLowerCase().includes("pickup"))];

    // Wrap each geocode so a single failure doesn't reject Promise.all
    const geoPromises = fullList.map((a) =>
      geocodeAddress(a.city + ' VIC').catch((err) => {
        console.warn("geocode failed for", a, err?.message || err);
        return null;
      })
    );
    const geocoded = await Promise.all(geoPromises);

    // Build points and track skipped addresses
    const points = [];
    const skipped = [];
    geocoded.forEach((g, i) => {
      if (!g) {
        skipped.push({ index: i, address: fullList[i] });
        return;
      }
      points.push({
        latitude: g.lat,
        longitude: g.lng,
        formatted_address: g.formatted_address,
        original: fullList[i],
      });
    });

    if (points.length < 2)
      return res
        .status(400)
        .json({ error: "At least two valid addresses required (including fixed start)." });

    // Google Routes API waypoint limit (cannot be increased)
    const MAX_INTERMEDIATES = 23;
    const MAX_POINTS_PER_REQUEST = MAX_INTERMEDIATES + 2; // origin + destination + intermediates

    // Build segments of points such that each request stays within waypoint limits
    const segments = [];
    let idx = 0;
    while (idx < points.length - 1) {
      const endIndex = Math.min(idx + MAX_POINTS_PER_REQUEST - 1, points.length - 1);
      segments.push(points.slice(idx, endIndex + 1)); // inclusive
      idx = endIndex; // next segment origin is previous destination
    }

    const computeUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": ROUTES_API_KEY,
      "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
    };

    const allRoutes = [];
    for (const seg of segments) {
      const origin = seg[0];
      const destination = seg.at(-1);
      const intermediates = seg.slice(1, -1).map((p) => ({
        location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
      }));

      const payload = {
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        intermediates,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "ENCODED_POLYLINE",
        regionCode: "AU",
      };

      const r = await axios.post(computeUrl, payload, { headers });
      if (r?.data?.routes) {
        // collect routes - each computeRoutes call can return multiple route alternatives
        allRoutes.push(...r.data.routes);
      } else {
        console.warn("computeRoutes returned no routes for a segment", seg);
      }
      // small delay could be added here if you hit quota / rate limits in practice
    }

    return res.json({
      routes: allRoutes,
      points,
      skipped,
    });
  } catch (err) {
    handleMongooseError(err, res);
    logError("computeRoutes", err, req.user?.user_ref_id);
  }
};


module.exports = { 
    computeRoutes
}