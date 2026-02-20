import React, { useEffect, useRef, useState } from "react";
import { FaMapMarkedAlt } from "react-icons/fa";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const GOCODE_API_KEY = process.env.REACT_APP_GEOCODE_API_KEY

const RouteMap = ({ addresses }) => {
  
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [loading, setLoading] = useState(false)

  // -------------------------------------
  // Load Google Maps JS dynamically
  // -------------------------------------
  const loadGoogleMaps = () =>
    new Promise((resolve) => {
      if (window.google && window.google.maps) return resolve();

      const script = document.createElement("script");
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${GOCODE_API_KEY}&libraries=geometry`;
      script.async = true;
      script.onload = resolve;
      document.body.appendChild(script);
    });

  useEffect(() => {
    if (!addresses?.length) return;

    async function run() {
      setLoading(true)
      await loadGoogleMaps();

      // ------------------------------------------
      // Call backend compute-route
      // ------------------------------------------
      const response = await fetch(`${API_BASE_URL}api/compute-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-token": localStorage.getItem("token") },
        body: JSON.stringify({ addresses }),
      });

      const data = await response.json();
      if (!data.routes?.length || !data.points?.length) {
        console.warn("Backend route error:", data);
        setLoading(false)
        return;
      }

      const encodedPolyline = data.routes[0].polyline.encodedPolyline;

      // Decode path from backend
      const decodedPath =
        window.google.maps.geometry.encoding.decodePath(encodedPolyline);

      // Convert backend geocoded points to LatLng objects
      const points = data.points.map((p) =>
        new window.google.maps.LatLng(p.latitude, p.longitude)
      );

      // ------------------------------------------
      // Create Map
      // ------------------------------------------
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        zoom: 12,
        center: points[0],
      });

      // Draw polyline
      new window.google.maps.Polyline({
        path: decodedPath,
        strokeColor: "#0057ff",
        strokeWeight: 6,
        strokeOpacity: 0.9,
        map: mapInstance.current,
      });

      // Fit map to route
      const bounds = new window.google.maps.LatLngBounds();
      decodedPath.forEach((p) => bounds.extend(p));
      mapInstance.current.fitBounds(bounds);

      const infoWindow = new window.google.maps.InfoWindow();

      // Hide close button via InfoWindow options and CSS
      // Set disableAutoPan to true to prevent unwanted panning
      // Use InfoWindow's pixelOffset to avoid overlap with marker
      // Add CSS to hide the close button
      const hideCloseButtonCSS = `
        .gm-ui-hover-effect {
          display: none !important;
        }
      `;
      // Inject CSS once
      if (!document.getElementById("hide-gm-close-btn")) {
        const style = document.createElement("style");
        style.id = "hide-gm-close-btn";
        style.innerHTML = hideCloseButtonCSS;
        document.head.appendChild(style);
      }

      const processedAddresses = [
        { ...addresses[0], order_unique_id: " ", delivery_time: "Encore Sheet Metal", delivery_date: "" }, // Fixed start with empty fields
        ...addresses
      ];

      data.points.forEach((p, index) => {
        const isPlant = index === 0;

        // Create circular Encore logo marker using SVG data URL
        const encoreLogoUrl = isPlant
          ? "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
          <svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="20" fill="white"/>
            <clipPath id="circleClip">
          <circle cx="20" cy="20" r="20"/>
            </clipPath>
            <image href="${require("../../Assets/images/encore-fav-map.png")}" x="2" y="2" width="36" height="36" clip-path="url(#circleClip)" />
          </svg>
        `)
          : null;

        const marker = new window.google.maps.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map: mapInstance.current,
          label: isPlant
        ? null
        : {
            text: `${index}`,
            fontWeight: "bold",
            color: "white",
          },
          icon: isPlant
        ? {
            url: encoreLogoUrl,
            scaledSize: new window.google.maps.Size(40, 40),
            origin: new window.google.maps.Point(0, 0),
            anchor: new window.google.maps.Point(20, 20),
          }
        : {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#0a74fff1",
            fillOpacity: 1,
            strokeColor: "#004E9A",
            strokeWeight: 2,
            scale: 15,
          },
        });

        // Tooltip only on hover (no sticky on click, no close button)
        marker.addListener("mouseover", () => {
          infoWindow.setOptions({
        disableAutoPan: true,
        pixelOffset: new window.google.maps.Size(0, -10),
          });
          // Remove "Australia" from the end of formatted address
          const cleanedAddress = p.formatted_address?.replace(/,?\s*Australia\s*$/i, "") || "";
          // Show order_unique_id if available
          const orderIdHtml = processedAddresses[index]?.order_unique_id
        ? `<div style="font-weight:bold; font-size:16px; text-align:center;">
            ${processedAddresses[index].order_unique_id}&nbsp; 
            <span style="color:#f00; font-size:16px; margin-left:6px;">
          ${processedAddresses[index].delivery_time}&nbsp; &nbsp; 
            </span>
            ${processedAddresses[index].delivery_date}
          </div>`
        : "";
          infoWindow.setContent(
        `${orderIdHtml}
        <div style="font-size:15px; color:#000; padding:4px; text-align:center;">${cleanedAddress}</div>`
          );
          infoWindow.open(mapInstance.current, marker);
        });

        marker.addListener("mouseout", () => infoWindow.close());

        // Prevent infoWindow from sticking on click
        marker.addListener("click", () => infoWindow.close());
      });

      // ------------------------------------------
      // 🚚 Red Circle "Truck" Animation
      // ------------------------------------------
      const truckMarker = new window.google.maps.Marker({
        position: decodedPath[0],
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#ff0000",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
      });

      let progress = 0;
      const speed = 0.0015; // adjust as needed

      function animateRoute() {
        progress += speed;

        if (progress >= 1) {
          truckMarker.setPosition(decodedPath.at(-1));
          return;
        }

        const index = Math.floor(progress * (decodedPath.length - 1));
        const nextIndex = index + 1;

        if (decodedPath[nextIndex]) {
          const t = progress * (decodedPath.length - 1) - index;

          const lat =
            decodedPath[index].lat() +
            (decodedPath[nextIndex].lat() - decodedPath[index].lat()) * t;

          const lng =
            decodedPath[index].lng() +
            (decodedPath[nextIndex].lng() - decodedPath[index].lng()) * t;

          truckMarker.setPosition(new window.google.maps.LatLng(lat, lng));
        }

        requestAnimationFrame(animateRoute);
      }

      animateRoute();
      setLoading(false)
    }

    run();
  }, [addresses]);

  return (
    <div style={{ position: "relative", width: "100%", height: "60vh", border: "1px solid #ccc" }}>
      <style>{`
        @keyframes ringRotate { to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.95 } 50% { transform: scale(1.18); opacity: 0.55 } 100% { transform: scale(1); opacity: 0.95 } }
      `}</style>

      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {loading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.7)",
            zIndex: 10,
          }}
        >
          <div style={{ padding: 12, background: "#fff", borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56 }}>
              <FaMapMarkedAlt size={48} color="#0a74ff" aria-hidden="true" />
            </div>

            <div style={{ marginTop: 8, fontSize: 14 }}>Loading Map...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteMap;
