import React, { useState, useEffect, useCallback } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { MyDiv, PTag, Avatar } from "./Components";
import { RiUserHeartLine, RiLockPasswordLine, RiLogoutCircleLine } from "react-icons/ri";
import Dropdown from "react-bootstrap/Dropdown";
import DropdownButton from "react-bootstrap/DropdownButton";
import axios from "axios";
import swal from "sweetalert2";
import { setDoubtCount } from "../../store/doubtSlice";
import { setSupplierCount } from "../../store/supplierSlice";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Header() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const dispatch = useDispatch();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const [melbourneTime, setMelbourneTime] = useState(
    new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );

  const loadUser = useCallback(
    async data => {
      await sleep(1000);
      const UserId = localStorage.getItem("userId");
      const Token = localStorage.getItem("token");
      const url = API_BASE_URL + `fetch-specific-profile/` + UserId;

      try {
        const response = await axios.get(url, {
          headers: {
            "x-access-token": `${Token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        setPosts(response.data);
        if (response.data?.length && response.data[0]?.DoubtCount != null) {
          dispatch(setDoubtCount(response.data[0].DoubtCount));
        }
        if (response.data?.length && response.data[0]?.SupplierCount != null) {
          dispatch(setSupplierCount(response.data[0].SupplierCount));
        }
      } catch (err) {
        swal.fire({
          text: err.response.data,
          icon: "error",
          type: "error",
        });

        if (err.response.data === "Invalid Token") {
          window.location.href = "/login";
        }
      }
    },
    [dispatch]
  );

  useEffect(() => {
    if (localStorage.getItem("token") === null && localStorage.getItem("role") === null) {
      navigate("/login");
    } else {
      async function init() {
        const data = localStorage.getItem("userId");
        loadUser(data);
      }
      init();
    }
  }, [loadUser, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMelbourneTime(
        new Date().toLocaleString("en-AU", {
          timeZone: "Australia/Melbourne",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const logoutCore = async () => {
    try {
      const url = API_BASE_URL + `user-logout`;
      await axios.post(
        url,
        {},
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      dispatch(setDoubtCount(0));
      dispatch(setSupplierCount(0));
      window.location.href = "/login";
    } catch (err) {
      const message = err?.response?.data || "Logout failed";
      swal.fire({
        text: message,
        icon: "error",
      });
    }
    window.location.href = "/login";
    localStorage.clear();
    sessionStorage.clear();
  };

  return (
    <header>
      <MyDiv className="row">
        <MyDiv className="col-md-4 col-6 d-flex align-items-center">
          <Link to="/dashboard">
            <img src={require("../../Assets/images/EncoreSheetMetalLogo.png")} alt="logo" />
          </Link>
        </MyDiv>
        {posts?.length
          ? posts.map(item => (
              <MyDiv className="col-md-8 text-end right-menu col-6" key={item}>
                <MyDiv className="HeaderInfo hide-for-small">
                  <span>{melbourneTime}</span>
                </MyDiv>
                <Avatar round="50px" size="40" name={item.user_firstName} src="" />
                <MyDiv className="ProfileArea">
                  <DropdownButton title={[item.user_firstName, " ", item.user_lastName]}>
                    <Dropdown.Item as={Link} to="/change-password">
                      <RiLockPasswordLine /> Change Password
                    </Dropdown.Item>
                    <Dropdown.Item as={Link} to="/profile">
                      <RiUserHeartLine /> My Profile
                    </Dropdown.Item>
                    <Dropdown.Item onClick={logoutCore}>
                      <RiLogoutCircleLine /> Logout
                    </Dropdown.Item>
                  </DropdownButton>
                  <PTag className="hide-for-small">{item.user_Designation}</PTag>
                </MyDiv>
              </MyDiv>
            ))
          : ""}
      </MyDiv>
    </header>
  );
}

export default Header;
