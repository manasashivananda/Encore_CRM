import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, PTag, HeadingThree, HeadingOne, CurrencyDisplay, getFormattedDeliveryTime } from "../Common/Components";
import { AiOutlinePrinter } from "react-icons/ai";
import { useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Drawer, Button } from "@mui/material";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import FormOrderItem from "./formOrderItem";
import html2canvas from "html2canvas";
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderInvoice() {
  let { id } = useParams();
  const [users, setUsers] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `order-invoice-details/` + id;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setUsers(res.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /* Search Module */

  const [userDrawerState, setUserDrawerState] = React.useState(false);
  const handleUserDrawerToggle = () => {
    setData();
    userDrawerState === false ? setUserDrawerState(true) : setUserDrawerState(false);
  };

  const updateDrawer = () => {
    userDrawerState === false ? setUserDrawerState(true) : setUserDrawerState(false);
    loadUsers();
  };
  const wrapper_ref = React.useRef();
  const onClick = e => {
    const opt = {
      scale: 4,
    };
    const elem = wrapper_ref.current;
    html2canvas(elem, opt).then(canvas => {
      const iframe = document.createElement("iframe");
      iframe.name = "printf";
      iframe.id = "printf";
      iframe.height = 100;
      iframe.width = 300;
      document.body.appendChild(iframe);

      const imgUrl = canvas.toDataURL({
        format: "jpeg",
        quality: "1.0",
      });

      const style = `
            height:auto;
            width:100vw;
            position:absolute;
            left:0:
            top:0;
            font: "monospace";
          `;

      const url = `<img style="${style}" src="${imgUrl}"/>`;
      var newWin = window.frames["printf"];
      newWin.document.write(`<body onload="window.print()">${url}</body>`);
      newWin.document.close();
    });
  };

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading">
        <Col md={6}>
          <HeadingTwo>Order Invoice</HeadingTwo>
        </Col>
        <Col md={6} className="text-end">
          <Button onClick={onClick} startIcon={<AiOutlinePrinter />} className="btn primary-btn">
            Print
          </Button>
        </Col>
      </MyDiv>

      <MyDiv className="invoiceLayout">
        {loading ? (
          <HeadingFour className="text-center">Loading...</HeadingFour>
        ) : (
          <div ref={wrapper_ref}>
            {users && users.OrderMaster?.length ? (
              users.OrderMaster[0].OrderMasterInfo.map(item => (
                <>
                  <MyDiv className="InvoiceHeader">
                    <Row>
                      <Col md={4}>
                        <img src={require("../../Assets/images/EncoreSheetMetalLogo.png")} alt="logo" />
                      </Col>
                      <Col md={4} className="text-center">
                        <HeadingOne>{item.order_invoice_id}</HeadingOne>
                      </Col>
                      <Col md={4} className="text-end">
                        <HeadingTwo>Encore Steel Metal Pty Ltd,</HeadingTwo>
                        <HeadingThree>A.B.N. : 47 631 765 163</HeadingThree>
                        <HeadingFour>
                          4 - 6 Conquest Way
                          <br />
                          Hallam VIC 3803
                        </HeadingFour>
                      </Col>
                    </Row>
                  </MyDiv>
                  <MyDiv className="InvoiceAddress">
                    <Row>
                      <Col md={5}>
                        <HeadingThree>Order Details:</HeadingThree>
                        <HeadingFour> Order Number: {item.order_unique_id}</HeadingFour>
                        <HeadingFour> No of Items: {item.order_Pieces}</HeadingFour>
                        <HeadingFour>
                          Delivery Date: {item.order_delivery_date_str} - {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
                        </HeadingFour>
                      </Col>
                      <Col md={3} className="text-left">
                        <HeadingThree>Customer Details:</HeadingThree>
                        <address>
                          {item.order_Customer_Address} ,<br />
                          {item.order_Customer_Contact_Fname}
                          <br />
                          {item.order_Customer_Contact_Lname}
                        </address>
                      </Col>
                      <Col md={4} className="text-end">
                        <HeadingThree>Delivery Address:</HeadingThree>
                        <address>
                          {item.order_delivery_address_mode === "0" ? "Store" : "Site"}
                          <br />
                          {item.order_delivery_address !== "Nil" ? item.order_delivery_address : item.order_Customer_StoreAddress}
                          <br />
                          Contact Number : {item.order_Customer_Contact_Phone}
                        </address>
                      </Col>
                    </Row>
                  </MyDiv>
                </>
              ))
            ) : (
              <></>
            )}
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Sub Order ID</TableCell>
                      <TableCell align="left">Material Name</TableCell>
                      <TableCell align="left">Color</TableCell>
                      <TableCell align="left">Color Spl Price %</TableCell>
                      <TableCell align="left">Girth</TableCell>
                      <TableCell align="left">Fold</TableCell>
                      <TableCell align="center">Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users?.OrderItems[0]?.OrderItemInfo?.length ? (
                      users.OrderItems[0].OrderItemInfo.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left">
                              <StrongTag>{item.order_item_unique_id}</StrongTag>
                            </TableCell>
                            <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell>
                            <TableCell align="left">{item.product_Color}</TableCell>
                            <TableCell align="left">{item.product_Color_Special_Price} %</TableCell>
                            <TableCell align="left">{item.product_Girth}</TableCell>
                            <TableCell align="left">{item.product_Fold}</TableCell>
                            <TableCell align="right">
                              <CurrencyDisplay value={item.order_item_special_price} currency="AUD" locale="en-US" />
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                    {users?.OrderMaster?.length ? (
                      users.OrderMaster[0].OrderMasterInfo.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell colSpan={6} align="right">
                            <StrongTag>Total Price : </StrongTag>
                          </TableCell>
                          <TableCell align="right">
                            <StrongTag>
                              <CurrencyDisplay value={item.order_Overall_Price} currency="AUD" locale="en-US" />
                            </StrongTag>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </MyDiv>
            <MyDiv className="InvoiceFooter">
              <Row>
                <Col md={6}>
                  <PTag>All Amount Payable under contracts to which this invoice relates, have been transferred to scottish Pacific Business Finance Pty Ltd</PTag>
                </Col>
                <Col md={6}></Col>
              </Row>
            </MyDiv>
          </div>
        )}
      </MyDiv>
      <Drawer anchor="right" open={userDrawerState} onClose={handleUserDrawerToggle}>
        <FormOrderItem handleClose={updateDrawer} userInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default OrderInvoice;
