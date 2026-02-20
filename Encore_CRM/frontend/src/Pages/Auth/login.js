import React, { useState, useEffect } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import swal from "sweetalert2";
import { Col, Row, Spinner, Button, Container } from "react-bootstrap";
import { HeadingFour,HeadingOne, MyDiv } from "../Common/Components";
import TextField from "@mui/material/TextField";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from 'prop-types';
import { Typography } from '@mui/material';
import useEnvironment from '../../hooks/useEnvironment';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const SECRET_KEY = process.env.REACT_APP_SECRET_KEY;

function CoreLogin({ onLogin }) {
  const env = useEnvironment();
  useEffect(() => {
    // Clear Local & Session Storage
    localStorage.clear();
    sessionStorage.clear();

    // Clear all cookies
    document.cookie.split(";").forEach(cookie => {
      document.cookie = cookie
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/");
    });

    // Disable caching completely for this page
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }

    // Force no-cache fetch mode
    const meta = document.createElement("meta");
    meta.httpEquiv = "Cache-Control";
    meta.content = "no-store, no-cache, must-revalidate, max-age=0";
    document.head.appendChild(meta);

  }, []);
  const navigate = useNavigate();
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    user_email: '',
    password: '',
    token_code: ''
  });
  const [otp2FAAuth, setOtp2FAAuth] = useState({
    qrCodeDataURL: '',
    message: ''
  })
  const [enableCode, setEnableCode] = useState(false)
  
  // Function to encrypt data
  const encryptData = text => {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBtnLoading(true);

    const encryptedData = {
      user_email: encryptData(data.user_email),
      password: encryptData(data.password),
    };

    const url = `${API_BASE_URL}user-login`;
    setOtp2FAAuth({})
    setEnableCode(false)
    try {
      const response = await axios.post(url, encryptedData);
      if (response.status === 200) {
        const { login, rolepermissions, Role_Name, auth, depts, constants } = response.data;
        onLogin()
        if(login?.login_status) {
          localStorage.setItem('userId', login.user_ref_id);
          localStorage.setItem('token', login.token);
          localStorage.setItem('role', JSON.stringify(rolepermissions));
          localStorage.setItem('role-name', Role_Name);
          localStorage.setItem('userEmail', login.user_email);
          localStorage.setItem('awfOrderSeries', constants?.AWF_ORDER_SERIES);
          localStorage.setItem('awfCustId', constants?.AWF_CUSTOMER_ID);
          localStorage.setItem("assignedDepartments", JSON.stringify(depts))
          // navigate('/dashboard');
          window.location.href = '/dashboard';
          swal.fire({
            text: 'Logged in Successfully',
            icon: 'success',
            type: 'success',
          });
          return
        }
        if (auth?.key && !auth.is2FARegistered) {
          setEnableCode(false)
          swal.fire({
            text: "2FA is not set, do you want to setup again?",
            icon: 'error',
            type: 'error',
            showCancelButton: true,
            cancelButtonText: "Cancel"
          }).then(async (res) => {
            if (res.isConfirmed) {
              await regenerate2FA()
            } else if (res.dismiss === swal.DismissReason.cancel) {
              handleCancel();
            }
          })

          return
        }
        setEnableCode(true)
        setOtp2FAAuth(auth)
      }
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Login failed",
        icon: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };


  const verifyToken = async (e) => {
    e.preventDefault();
    setBtnLoading(true);
    const url = `${API_BASE_URL}verify-auth`;
    try {
      const encryptedData = {
        user_email: encryptData(data.user_email),
        token_code: data?.token_code
      };
      const response = await axios.post(url, encryptedData);
      const { login, rolepermissions, Role_Name, depts, constants } = response.data;
      if (response.status === 200 && login?.login_status) {
          localStorage.setItem('userId', login.user_ref_id);
          localStorage.setItem('token', login.token);
          localStorage.setItem('role', JSON.stringify(rolepermissions));
          localStorage.setItem('role-name', Role_Name);
          localStorage.setItem('userEmail', login.user_email);
          localStorage.setItem('awfOrderSeries', constants?.AWF_ORDER_SERIES);
          localStorage.setItem('awfCustId', constants?.AWF_CUSTOMER_ID);
          localStorage.setItem("assignedDepartments", JSON.stringify(depts))
          // navigate('/dashboard');

          window.location.href = '/dashboard';
        swal.fire({
          text: 'Logged in Successfully',
          icon: 'success',
          type: 'success',
        });
      }
    } catch (error) {
      console.log('Error:', error);
      swal.fire({
        text: error.response?.data,
        icon: 'error',
        type: 'error',
      });
    } finally {
      setBtnLoading(false);
    }
  }

  const handleCancel = () => {
    console.log("Cancelled!");
  };

  const regenerate2FA = async () => {
    setBtnLoading(true);
    const url = `${API_BASE_URL}regenerate-auth`;
    try {
      const response = await axios.post(url, { user_email: encryptData(data.user_email) });
      if (response.status === 200) {
        setOtp2FAAuth(response.data)
        setEnableCode(true)
      }
    } catch (error) {
      swal.fire({
        text: error.response?.data,
        icon: 'error',
        type: 'error',
      });
    } finally {
      setBtnLoading(false);
    }
  }


  const handleChange = (e) => {
    const { id, value } = e.target;
    setData(prevData => ({ ...prevData, [id]: value }));
  };

  return (
    <Container className="LoginPage">
      <Row className="row GeneralHeading login-form justify-content-center">
        <Col md={7} className="loginContainer">
          <Row>
            <Col md={6} className="loginLeft text-center">
              <MyDiv className="loginLogo">
                <img src={require("../../Assets/images/logo.png")} alt="logo" />
              </MyDiv>
            </Col>
            <Col md={6} className="text-center loginRight">
            {(env.base_url === env.test_url || env.base_url === env.test_url_2) && (
              <HeadingOne style={{ color: 'red', marginBottom: '10px', fontWeight: 'bold' }}>TESTING SITE</HeadingOne>
            )}
              <form onSubmit={!enableCode ? handleSubmit : verifyToken}>
                <HeadingFour className="card-title login-head">
                  ENCORE CRM APPLICATION
                  <br />
                  <br />
                  LOGIN
                </HeadingFour>
                {!otp2FAAuth?.qrCodeDataURL ?
                  <>
                    <Col md={12}>
                      <TextField
                        type="email"
                        id="user_email"
                        fullWidth
                        margin="dense"
                        label="Email"
                        variant="standard"
                        value={data.user_email}
                        onChange={handleChange}
                        required
                        disabled={enableCode}
                      />
                    </Col>
                    <Col md={12}>
                      <TextField
                        type="password"
                        id="password"
                        fullWidth
                        margin="dense"
                        label="Password"
                        variant="standard"
                        value={data.password}
                        onChange={handleChange}
                        required
                        disabled={enableCode}
                      />
                    </Col>
                  </>
                  :
                    <MyDiv className="loginLogo">
                      <p>{otp2FAAuth?.message}</p>
                      <img src={otp2FAAuth.qrCodeDataURL} alt="code" />
                    </MyDiv>
                }
                {enableCode &&
                  <Col md={12}>
                    <TextField
                      type="text"
                      id="token_code"
                      fullWidth
                      margin="dense"
                      label="Code"
                      variant="standard"
                      value={data.token_code}
                      onChange={handleChange}
                      required
                    />
                  </Col>
                }
                <Col md={12}>
                  {btnLoading ? (
                    <Button variant="primary" disabled className="mt-4 w-100">
                      <span aria-live="polite" className="d-inline-flex align-items-center">
                        <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                        <span className="visually-hidden">Loading...</span>
                      </span>
                    </Button>
                  ) : (
                    <button type="submit" className="btn primary-btn add-cta w-100 mt-4">
                      {!enableCode ? "LOGIN" : "VERIFY TOKEN"}
                    </button>
                  )}
                </Col>
                <Col md={12} className="text-end" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant='body1' component="title" color="blue" style={{ textDecoration: 'underline', cursor: 'pointer', visibility:enableCode ? 'visible' : 'hidden' }} className="mt-3 d-block" onClick={() => regenerate2FA()}>
                    Reset 2FA
                  </Typography>
                  <Link to="/forgot-password" className="mt-3 d-block">
                    Forgot Password
                  </Link>
                </Col>
              </form>
            </Col>
          </Row>
        </Col>
      </Row>
    </Container>
  );
}

CoreLogin.propTypes = {
  onLogin : PropTypes.func
}

export default CoreLogin;
