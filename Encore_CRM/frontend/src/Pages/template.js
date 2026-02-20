import React, { useState, useEffect } from "react";
import { Sidebar, Menu, MenuItem, useProSidebar, SubMenu } from "react-pro-sidebar";
import { Outlet, Link, useLocation } from "react-router-dom";
import Header from "./Common/header";
import { MyDiv, PTag } from "./Common/Components";
import { AiFillDashboard } from "react-icons/ai";
import { BiMenu } from "react-icons/bi";
import { BsCart4, BsPatchQuestion } from "react-icons/bs";
import { MdLabel, MdOutlineAutoGraph, MdOutlineProductionQuantityLimits } from "react-icons/md";
import { LiaIndustrySolid } from "react-icons/lia";
import { FaRegObjectGroup } from "react-icons/fa";
import { RiUserSettingsLine } from "react-icons/ri";
import { Button } from "react-bootstrap";
// import CoordinatorChat from "./Socket/Chat";
import { MdRateReview } from "react-icons/md";
// import { NotifyMessage } from "./Socket/NotifyMessage";
// Dashboard
import { MdOutlineDashboard, MdOutlineAnalytics, MdLocationCity, MdListAlt } from "react-icons/md";

// Masters
import { FaUserFriends } from "react-icons/fa";
import { GiMaterialsScience } from "react-icons/gi";
import { AiOutlineNumber } from "react-icons/ai";
import { MdOutlineInventory2 } from "react-icons/md";

// Quotations
import { HiOutlineDocumentText } from "react-icons/hi";
import { FaPencilRuler } from "react-icons/fa";
import { MdOutlineRule } from "react-icons/md";

// Orders
import { BsCartCheck } from "react-icons/bs";

// Production
import { AiOutlineBarcode } from "react-icons/ai";
import { MdOutlineBuildCircle } from "react-icons/md";

// Reports
import { RiFileList2Line, RiUserSearchLine } from "react-icons/ri";
import { MdOutlineBrush, MdOutlineAssignmentTurnedIn, MdOutlineWorkHistory } from "react-icons/md";
import { FaUserCog } from "react-icons/fa";

// Delivery Planning
import { MdOutlineMap } from "react-icons/md";
import { FaTruckLoading, FaClipboardList } from "react-icons/fa";
import { IoDocumentTextOutline } from "react-icons/io5";
import { FaCalendarAlt } from "react-icons/fa";

// Transport
import { MdOutlineRoute } from "react-icons/md";
import { BiSearchAlt } from "react-icons/bi";
import { FaUserTie, FaTruck } from "react-icons/fa";
import {FaShuttleVan} from "react-icons/fa";

// Users
import { FaUsersCog } from "react-icons/fa";
import { RiShieldUserLine } from "react-icons/ri";

//SWI Machine Report
import { MdPrecisionManufacturing } from "react-icons/md";


function TemplateCore() {
  const { collapseSidebar, collapsed } = useProSidebar();
  const pathname = useLocation().pathname;
  const RolePermission = JSON.parse(localStorage.getItem("role"));
  const [openMenu, setOpenMenu] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Close submenu and collapse sidebar when route changes (after clicking a menu item)
  useEffect(() => {
    setOpenMenu(null);
    // Auto-collapse sidebar on navigation if it's expanded
    if (!isCollapsed) {
      collapseSidebar();
      setIsCollapsed(true);
    }
  }, [pathname]);

  // Toggle sidebar and sync local state
  const handleToggleSidebar = () => {
    collapseSidebar();
    setIsCollapsed(!isCollapsed);
  };

  const handleMenuClick = (menuName) => {
    setOpenMenu(prev => (prev === menuName ? null : menuName));
  };

  // Custom Link component that closes submenu after navigation
  const MenuLink = ({ to, children, ...props }) => (
    <Link to={to} {...props} onClick={() => setOpenMenu(null)}>
      {children}
    </Link>
  );

  return (
    <div>
      <Header />
      <MyDiv className="GeneralContainer">
        <MyDiv className="LeftSideContainer">
          <Button className="SidebarCollapse" onClick={handleToggleSidebar}>
            <BiMenu />
          </Button>
          <Sidebar collapsed={isCollapsed}>
            <Menu>
              {/* 1. Dashboard */}
              <SubMenu 
                open={openMenu === "dashboard"}     // 👈 controls open
                onClick={() => handleMenuClick("dashboard")} 
                label="Dashboard" 
                className={`${pathname === "/dashboard" || pathname === "/dashboard/operation" || pathname === "/dashboard/prod-status" ? "menuActive" : ""}`} 
                icon={<AiFillDashboard />}
              >
                <MenuItem
                  className={`${pathname === "/dashboard" ? "menuActive submenuItem" : "submenuItem"}`}
                  component={<MenuLink to="/dashboard" />}
                  icon={<MdOutlineDashboard/>}
                >
                  Dashboard
                </MenuItem>
                {RolePermission?.Master && RolePermission?.OperationDashboard?.view === "1" && (
                  <MenuItem
                    className={`${pathname === "/dashboard/operation" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/dashboard/operation" />}
                    icon={<MdOutlineAnalytics/>}
                  >
                    Operations Dashboard
                  </MenuItem>
                )}
                {/* Production Status Dashboard */}
                {RolePermission?.Master && RolePermission?.Common?.view === "1" && (
                  <MenuItem
                    className={`${pathname === "/dashboard/prod-status" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/dashboard/prod-status" />}
                    icon={<MdOutlineProductionQuantityLimits/>}
                  >
                    Production Status
                  </MenuItem>
                )}
              </SubMenu>

              {/* 2. Masters */}
              <SubMenu 
                open={openMenu === "masters"}     // 👈 controls open
                onClick={() => handleMenuClick("masters")} 
                label="Masters" 
                className={`${pathname === "/customer" || pathname === "/materials" || pathname === "/custom-item-code" || pathname === "/racking" ? "menuActive" : ""}`} 
                icon={<FaRegObjectGroup />}
              >
                {RolePermission?.Customer?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/customer") ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/customer" />} 
                    icon={<FaUserFriends/>}>
                    Customers
                  </MenuItem>
                )}
                {RolePermission?.Product?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/materials") ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/materials" />}
                    icon={<GiMaterialsScience/>}>
                    Materials
                  </MenuItem>
                )}
                {RolePermission?.CustomItemMaster?.view === "1" && (
                  <MenuItem 
                    className={`${pathname === "/custom-item-code" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/custom-item-code" />}
                    icon={<AiOutlineNumber/>}>
                    Custom Item Code
                  </MenuItem>
                )}
                {RolePermission?.Master?.view === "1" && (
                  <MenuItem 
                    className={`${pathname === "/racking" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/racking" />}
                    icon={<MdOutlineInventory2/>}>
                    Racks
                  </MenuItem>
                )}
                {RolePermission?.Master?.view === "1" ? (
                  <MenuItem title="City" icon={<MdLocationCity />} className={`${pathname === "/city" ? "menuActive submenuItem" : "submenuItem"}`} component={<MenuLink to="/city" />}>
                    City
                  </MenuItem>
                ) : (
                  ""
                )}
                {RolePermission?.Master?.view === "1" ? (
                  <MenuItem title="Logs" icon={<MdListAlt />} className={`${pathname === "/logs" ? "menuActive submenuItem" : "submenuItem"}`} component={<MenuLink to="/logs" />}>
                    Logs
                  </MenuItem>
                ) : (
                  ""
                )}
              </SubMenu>

              {/* 3. Quotations */}
              <SubMenu 
                open={openMenu === "quotations"}     // 👈 controls open
                onClick={() => handleMenuClick("quotations")} 
                className={`${pathname.startsWith("/quotation/master") || pathname.startsWith("/quotation/designers") || pathname.startsWith("/quotation/quality-checking") ? "menuActive" : ""}`}
                label="Quotations" 
                icon={<BsPatchQuestion />}
              >
                {RolePermission?.OrderManagement?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/quotation/master") || pathname === "/quotation/" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/quotation/master" />} 
                    icon={<HiOutlineDocumentText/>}>
                    Quotation Master
                  </MenuItem>
                )}
                {RolePermission?.DesignerModule?.view === "1" && (
                  <>
                    <MenuItem 
                      className={`${pathname.startsWith("/quotation/designers") || pathname === "/quotation/designers" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/quotation/designers" />}
                      icon={<FaPencilRuler/>}>
                      Designers Management
                    </MenuItem>
                    <MenuItem 
                      className={`${pathname.startsWith("/quotation/quality-checking") || pathname === "/quotation/quality-checking" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/quotation/quality-checking" />}
                      icon={<MdOutlineRule/>}>
                      QC Management
                    </MenuItem>
                  </>
                )}
              </SubMenu>

              {/* 4. Orders */}
              <SubMenu 
                open={openMenu === "orders"}     // 👈 controls open
                onClick={() => handleMenuClick("orders")} 
                className={`${pathname.startsWith("/orders") || pathname.startsWith("/designers") || pathname.startsWith("/quality-checking") ? "menuActive" : ""}`}
                label="Orders"
                icon={<BsCart4 />}
              >
                {RolePermission?.OrderManagement?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/orders") || pathname === "/orders" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/orders" />} 
                    icon={<BsCartCheck />}>
                    Master Orders
                  </MenuItem>
                )}
                {RolePermission?.DesignerModule?.view === "1" && (
                  <>
                    <MenuItem 
                      className={`${pathname.startsWith("/designers") || pathname === "/designers" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/designers" />} 
                      icon={<FaPencilRuler/>}>
                      Designers Management
                    </MenuItem>
                    <MenuItem 
                      className={`${pathname.startsWith("/quality-checking") || pathname === "/quality-checking" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/quality-checking" />} 
                      icon={<MdOutlineRule/>}>
                      QC Management
                    </MenuItem>
                  </>
                )}
              </SubMenu>

              {/* 5. Production */}
              <SubMenu 
                open={openMenu === "production"}     // 👈 controls open
                onClick={() => handleMenuClick("production")} 
                className={`${pathname.startsWith("/production") || pathname.startsWith("/reports/rack-management") || pathname.startsWith('/generate-barcode') ? "menuActive" : ""}`}
                label="Production" 
                icon={<LiaIndustrySolid />}
              >
                {RolePermission?.Production?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/production") || pathname === "/production" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/production" />} 
                    icon={<AiOutlineBarcode/>}>
                    Barcode Scanning
                  </MenuItem>
                )}
                <MenuItem 
                  className={`${pathname.startsWith("/reports/rack-management") || pathname === "/reports/rack-management" ? "menuActive submenuItem" : "submenuItem"}`}
                  component={<MenuLink to="/reports/rack-management" />} 
                  icon={<MdOutlineBuildCircle/>}>
                  Rack Updation
                </MenuItem>
                {RolePermission?.BarcodeGenerator?.view === "1" ?
                  <MenuItem title="Barcode Generator" className={`${pathname.startsWith('/generate-barcode') ? "menuActive submenuItem" : "submenuItem"}`} icon={<MdLabel />} component={<MenuLink to="/generate-barcode" />}>Barcode Generator </MenuItem>
                : ""}
              </SubMenu>

              {/* 6. Reports */}
              <SubMenu 
                open={openMenu === "reports"}     // 👈 controls open
                onClick={() => handleMenuClick("reports")} 
                className={`${
                  pathname.startsWith("/reports/order-reports") || 
                  pathname.startsWith("/reports/designer-reports") || 
                  pathname.startsWith("/reports/qc-reports") || 
                  pathname.startsWith("/reports/production-reports") || 
                  pathname.startsWith("/reports/production-emp-work-info") || 
                  pathname.startsWith("/reports/swi-machine") ||
                  pathname.startsWith("/reports/customer-reports") ? "menuActive" : ""}`}
                label="Reports" 
                icon={<MdOutlineAutoGraph />}
              >
                {RolePermission?.Master && RolePermission?.OrderReport?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("/reports/order-reports") || pathname === "/reports/order-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/reports/order-reports" />} 
                    icon={<RiFileList2Line/>}>
                    Order Entry Report
                  </MenuItem>
                )}
                {RolePermission?.Master && RolePermission?.DesignReport?.view === "1" && (
                  <>
                    <MenuItem 
                      className={`${pathname.startsWith("/reports/designer-reports") || pathname === "/reports/designer-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/reports/designer-reports" />} 
                      icon={<MdOutlineBrush/>}>
                      Designer Reports
                    </MenuItem>
                    <MenuItem 
                      className={`${pathname.startsWith("//reports/qc-reports") || pathname === "/reports/qc-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/reports/qc-reports" />} 
                      icon={<MdOutlineAssignmentTurnedIn/>}>
                      QC Reports
                    </MenuItem>
                  </>
                )}
                {RolePermission?.Master && RolePermission?.ProductionReport?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("//reports/production-reports") || pathname === "/reports/production-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/reports/production-reports" />} 
                    icon={<FaUserCog/>}>
                    Production Emp Reports
                  </MenuItem>
                )}
                {RolePermission?.Production?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("//reports/production-emp-work-info") || pathname === "/reports/production-emp-work-info" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/reports/production-emp-work-info" />} 
                    icon={<MdOutlineWorkHistory/>}>
                    Prod Emp Work Info
                  </MenuItem>
                )}
                {RolePermission?.Master && RolePermission?.CustomerReport?.view === "1" && (
                  <MenuItem 
                    className={`${pathname.startsWith("//reports/customer-reports") || pathname === "/reports/customer-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/reports/customer-reports" />}
                    icon={<RiUserSearchLine/>}>
                    Customer Reports
                  </MenuItem>
                )}
                {/* code added rahul  */}
                {RolePermission?.Master && RolePermission?.SWIMachineReport?.view === "1" ? (
                  <MenuItem
                    title="SWI Machine Report"
                    className={`${pathname === "/reports/swi-machine" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/reports/swi-machine" />}
                    icon={<MdPrecisionManufacturing />}
                  >
                    SWI Machine Report
                  </MenuItem>
                ) : (
                  ""
                )}
              </SubMenu>

              {/* 7. Delivery Planning */}
              {RolePermission?.DeliveryPlanning?.view === "1" && (
                <SubMenu 
                  open={openMenu === "deliveryPlanning"}     // 👈 controls open
                  onClick={() => handleMenuClick("deliveryPlanning")} 
                  className={`${pathname.startsWith("/del-planning") || pathname.startsWith( "/del-planning/ext-orders") || pathname.startsWith("/reports/delivery-reports") || pathname.startsWith("/reports/delivery-docket") ? "menuActive" : ""}`}
                  label="Delivery Planning" 
                  icon={<MdOutlineMap />}
                >
                  <MenuItem 
                    className={`${pathname === "/del-planning" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/del-planning" />} 
                    icon={<FaCalendarAlt />}>
                    Planning Dashboard
                  </MenuItem>
                  <MenuItem 
                    className={`${pathname.startsWith("/del-planning/ext-orders") || pathname === "/del-planning/ext-orders" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/del-planning/ext-orders" />} 
                    icon={<FaTruckLoading/>}>
                    External Orders
                  </MenuItem>
                  {RolePermission?.Master && RolePermission?.DeliveryReport?.view === "1" && (
                    <MenuItem 
                      className={`${pathname.startsWith("/reports/delivery-reports") || pathname === "/reports/delivery-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/reports/delivery-reports" />}
                      icon={<FaClipboardList/>}>
                      Delivery Reports
                    </MenuItem>
                  )}
                  {RolePermission?.Master && RolePermission?.DeliveryDocket?.view === "1" && (
                    <MenuItem 
                      className={`${pathname.startsWith("/reports/delivery-docket") ||  pathname === "/reports/delivery-docket" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/reports/delivery-docket" />}
                      icon={<IoDocumentTextOutline/>}>
                      Delivery Docket
                    </MenuItem>
                  )}
                </SubMenu>
              )}

              {/* 8. Transport */}
              {RolePermission?.RunsManagement?.view === "1" && (
                <SubMenu 
                  open={openMenu === "transport"}     // 👈 controls open
                  onClick={() => handleMenuClick("transport")} 
                  className={`${pathname.startsWith("/transport/runs") || pathname.startsWith( "/reports/loading-reports") || pathname.startsWith( "/transport/drivers") || pathname.startsWith("/transport/trucks") ? "menuActive" : ""}`}
                  label="Transport" 
                  icon={<FaShuttleVan />}
                >
                  <MenuItem 
                    className={`${pathname.startsWith("/transport/runs") || pathname === "/transport/runs" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/transport/runs" />}
                    icon={<MdOutlineRoute />}>
                    Manage Runs
                  </MenuItem>
                  {RolePermission?.Master && RolePermission?.LoadingReport?.view === "1" && (
                    <MenuItem 
                      className={`${pathname.startsWith("/reports/loading-reports") || pathname === "/reports/loading-reports" ? "menuActive submenuItem" : "submenuItem"}`}
                      component={<MenuLink to="/reports/loading-reports" />}
                      icon={<BiSearchAlt/>}>
                      Find My Rack
                    </MenuItem>
                  )}
                  <MenuItem 
                    className={`${pathname.startsWith("/transport/drivers") || pathname === "/transport/drivers" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/transport/drivers" />}
                    icon={<FaUserTie/>}>
                    Manage Drivers
                  </MenuItem>
                  <MenuItem 
                    className={`${pathname.startsWith("/transport/trucks") || pathname === "/transport/trucks" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/transport/trucks" />}
                    icon={<FaTruck/>}>
                    Manage Trucks
                  </MenuItem>
                </SubMenu>
              )}

              {/* 9. Users */}
              {RolePermission?.UserManagement?.view === "1" && (
                <SubMenu 
                  open={openMenu === "users"}     // 👈 controls open
                  onClick={() => handleMenuClick("users")} 
                  className={`${pathname.startsWith("/users") || pathname.startsWith("/users/roles") ? "menuActive" : ""}`}
                  label="Users" 
                  icon={<RiUserSettingsLine />}
                >
                  <MenuItem 
                    className={`${pathname === "/users" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/users" />} 
                    icon={<FaUsersCog/>}>
                    Manage Users
                  </MenuItem>
                  <MenuItem 
                    className={`${pathname === "/users/roles" ? "menuActive submenuItem" : "submenuItem"}`}
                    component={<MenuLink to="/users/roles" />}
                    icon={<RiShieldUserLine/>}>
                    Manage Roles
                  </MenuItem>
                </SubMenu>
              )}

              {/* Extra: Order Coordinator (kept outside main structure) */}
              {RolePermission?.OrderCoordinator?.view === "1" && (
                <MenuItem
                  className={`${pathname.startsWith("/msg") ? "menuActive" : ""}`}
                  icon={<MdRateReview />}
                  component={<MenuLink to="/msg" />}
                >
                  Order Coordinator
                </MenuItem>
              )}
            </Menu>
          </Sidebar>
        </MyDiv>

        {/* Right side */}
        <MyDiv className="RightMainContainer">
          <MyDiv className="Right-Side-Main-Container">
            <Outlet />
          </MyDiv>
          {/* {RolePermission?.OrderCoordinator?.view === "1" && RolePermission?.OrderCoordinator?.add === "1" && (
            <CoordinatorChat />
          )} */}
          <MyDiv className="footer-copyrights">
            <PTag className="text-center mt-15">{new Date().getFullYear()} @ ENCORE. All rights reserved</PTag>
          </MyDiv>
          {/* {RolePermission?.OrderCoordinator?.view === "1" && RolePermission?.OrderCoordinator?.add !== "1" && (
            <NotifyMessage />
          )} */}
        </MyDiv>
      </MyDiv>
    </div>
  );
}

export default TemplateCore;