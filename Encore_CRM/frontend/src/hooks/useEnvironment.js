import { useEffect } from "react";

export default function useEnvironment() {
  const base_url = process.env.REACT_APP_API_BASE_URL;
  const test_url = "https://api.desaltencorecrm.co.in/";
  const test_url_2 = "https://api.desalt.co.in/";

  useEffect(() => {
    if ( base_url === test_url) {
        document.body.classList.remove("test-theme2");
        document.body.classList.add("test-theme");
    }
    else if (base_url === test_url_2) {
        document.body.classList.remove("test-theme");
        document.body.classList.add("test-theme2");
    }
    else {
      document.body.classList.remove("test-theme");
      document.body.classList.remove("test-theme2");
    }

  }, [base_url]);

  return {base_url, test_url, test_url_2};
}
