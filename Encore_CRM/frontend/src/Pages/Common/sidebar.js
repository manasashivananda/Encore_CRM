import * as React from "react";
import { Link } from "react-router-dom";


function Sidebar() {
    return (
      <aside className="mainSidebar">
        sidebar
        <nav>
        <ul>
          <li>
            <Link to="/dashboard">Home</Link>
          </li>
          <li>
            <Link to="/employee">Employee</Link>
          </li>
          <li>
            <Link to="/salary">Salary</Link>
          </li>
        </ul>
      </nav>
      </aside>
    );
  }
  
export default Sidebar;


