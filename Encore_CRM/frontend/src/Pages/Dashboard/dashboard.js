import React, { useState, useEffect } from "react";
import { Col, Row, Card } from "react-bootstrap";
import { HeadingThree, HeadingFour, HeadingTwo, MyDiv, SpanTag, PTag } from "../Common/Components";
import axios from "axios";
import { FaUsers, FaUserCheck } from "react-icons/fa";
import { GiStack } from "react-icons/gi";
import { ImStackoverflow } from "react-icons/im";
import PieGraphs from "./pie";
import BarGraphs from "./bar";
import { Chip, Link, Stack, Tooltip, Typography } from '@mui/material';
import Swal from 'sweetalert2';
import moment from 'moment';
import { FaMapMarkerAlt } from "react-icons/fa";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem('role'));

function DashboardMain() {
  const [data, setData] = useState([]);
  const [thisMonthOrder, setThisMonthOrderData] = useState([]);
  const [monthlyOrder, setMonthlyOrderData] = useState([]);
  const [suspiciousLogsData, setSuspiciousLogsData] = useState([]);

  useEffect(() => {
    loadDashboardTop();
    loadThisMonthWiseOrder();
    loadMonthWiseOrder();
    loadSuspeciousLogins();
  },[]);


  const loadDashboardTop = async () => {
    const url = API_BASE_URL + `dashboard-info-details`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setData(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };
  const loadThisMonthWiseOrder = async () => {
    const url = API_BASE_URL + `dashboard-monthly-order-details`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setThisMonthOrderData(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };
  const loadMonthWiseOrder = async () => {
    const url = API_BASE_URL + `dashboard-yearly-order-details`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setMonthlyOrderData(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };

  const loadSuspeciousLogins = async () => {
    var url = API_BASE_URL + `fetch-suspicious-logins`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
      .then(res => {
        setSuspiciousLogsData(res.data.data)
      },
        (error) => {
          //alert('Contact fetching failed: ' + error)
        })
  }

  const handleDelete = async (id) =>{
    try {
            const method = "PATCH";
            const url = `${API_BASE_URL}update-suspicious-logins/${id}`;
            const response = await axios({
                method,
                url,
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              });
            if (response.status) {
                
                loadSuspeciousLogins()
            } else {
                Swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        }
  }

  return (
    <React.Fragment>
      <Row className="DashboardTop mt-3">
        <Col md={3}>
          <MyDiv className="DashboardTopItem">
            <SpanTag className="DashboardTopItemIcon">
              <FaUsers />
            </SpanTag>
            <MyDiv className="DashboardTopItemContent">
              <HeadingThree>Total Customers</HeadingThree>
              <HeadingFour>{data.Customer && data.Customer.count ? data.Customer.count : "0"}</HeadingFour>
            </MyDiv>
            <MyDiv className="DashboardTopItemNotes">
              <PTag>Active Customers</PTag>
            </MyDiv>
          </MyDiv>
        </Col>
        <Col md={3}>
          <MyDiv className="DashboardTopItem">
            <SpanTag className="DashboardTopItemIcon">
              <ImStackoverflow />
            </SpanTag>
            <MyDiv className="DashboardTopItemContent">
              <HeadingThree>Total Orders</HeadingThree>
              <HeadingFour>{data.Orders && data.Orders.count ? data.Orders.count : "0"}</HeadingFour>
            </MyDiv>
            <MyDiv className="DashboardTopItemNotes">
              <PTag>Completed Orders</PTag>
            </MyDiv>
          </MyDiv>
        </Col>
        <Col md={3}>
          <MyDiv className="DashboardTopItem">
            <SpanTag className="DashboardTopItemIcon">
              <FaUserCheck />
            </SpanTag>
            <MyDiv className="DashboardTopItemContent">
              <HeadingThree>Total Users</HeadingThree>
              <HeadingFour>{data.Users && data.Users.count ? data.Users.count : "0"}</HeadingFour>
            </MyDiv>
            <MyDiv className="DashboardTopItemNotes">
              <PTag>Active Users</PTag>
            </MyDiv>
          </MyDiv>
        </Col>
        <Col md={3}>
          <MyDiv className="DashboardTopItem">
            <SpanTag className="DashboardTopItemIcon">
              <GiStack />
            </SpanTag>
            <MyDiv className="DashboardTopItemContent">
              <HeadingThree>Total Materials</HeadingThree>
              <HeadingFour>{data.Materials && data.Materials.count ? data.Materials.count : "0"}</HeadingFour>
            </MyDiv>
            <MyDiv className="DashboardTopItemNotes">
              <PTag>Available Materials</PTag>
            </MyDiv>
          </MyDiv>
        </Col>
      </Row>
    {RolePermission?.UserManagement?.view === "1" && suspiciousLogsData.length > 0 &&
          <Card>
            <Card.Header className='bg-red p-1'>
              <HeadingThree>Suspicious Logins</HeadingThree>
            </Card.Header>
            <Card.Body>
              <Row>
              {suspiciousLogsData && suspiciousLogsData.map((item) => (
                <Col md={2} className='g-1'>
                  <Stack direction="row">
                    <Tooltip 
                      title={
                        <Typography variant='body2'>
                          {item.reason} 
                          <br/> 
                          {moment(item.login_time).utc().add(item?.region?.toLowerCase() === "india" ? 330 : 600, 'minutes').format('DD-MM-YYYY hh:mm a') + '\n'}
                          <Link 
                            underline='none' 
                            sx={{ color: 'white' }} 
                            variant='body1' 
                            target='_blank' 
                            href={`https://www.google.com/maps?q=${item?.location?.lat},${item?.location?.lng}`}
                          >
                            {item?.location?.lat && item?.location?.lng && <FaMapMarkerAlt size={20}/>}
                          </Link>
                        </Typography>
                      } 
                    >
                      <Chip label={item.users?.user_Email} variant="filled" color='info' onDelete={() => handleDelete(item._id)}/>
                    </Tooltip>
                  </Stack>
                </Col>
              ))}
              </Row>
            </Card.Body>
          </Card>
        }
        <Row className='GraphContainer  mt-3'>        
          <Col md={5}>
          <Card>
            <Card.Header>
              <HeadingTwo>Orders in This Month</HeadingTwo>
            </Card.Header>
            <Card.Body>
              <PieGraphs graphData={thisMonthOrder} />
            </Card.Body>
          </Card>
        </Col>
        <Col md={7}>
          <Card>
            <Card.Header>
              <HeadingTwo>Total Orders</HeadingTwo>
            </Card.Header>
            <Card.Body>
              <BarGraphs graphData={monthlyOrder} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </React.Fragment>
  );
}

export default DashboardMain;
