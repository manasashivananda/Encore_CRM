import React from "react";
import { Col } from "react-bootstrap";
import Barcode from "react-barcode";
import { MyDiv, HeadingThree, HeadingTwo, SpanTag, LabelTag, HeadingFour, StrongTag, getFormattedDeliveryTime } from "../Common/Components";
import { QRCode } from "react-qrcode-logo";

const AWF_CUST_ID = localStorage.getItem("awfCustId");

const BarcodeSection = ({ item, department, barcodeRef }) => {
  const getShortenedDepartment = () => {
    if (department === "Flashing" || !department) {
      return "";
    } else if (department === "Jobbing") {
      return department.charAt(0).toUpperCase();
    } else if (department === "Facia Gutter") {
      return "FG";
    } else if (department === "GBI") {
      return "GBI";
    } else if (department === "Roofing") {
      return "ROOF";
    } else {
      return department.substring(0, 2).toUpperCase();
    }
  };
  const getCount = () => {
    switch (department) {
      case "Flashing":
        return item.Order_Flashing_Count;
      case "Jobbing":
        return item.Order_Jobbing_Count;
      case "Facia Gutter":
        return item.Order_Faciagutter_Count;
      case "Cladding":
        return item.Order_Cladding_Count;
      case "GBI":
        return item.Order_GBI_Count;
      case "Roofing":
        return item.Order_Roofing_Count;
      default:
        return "";
    }
  };
  return (
    <Col md={12} xs={12} sm={12} className="mt-3">
      <HeadingThree>{department} Barcode</HeadingThree>
      <div ref={barcodeRef} className="barcodeContainer">
        <MyDiv className="BarcodeHeader">
          <MyDiv className={item.account_UID === AWF_CUST_ID ? "barcodeLogoAwf" : "barcodeLogo"}>
            <img src={item.account_UID === AWF_CUST_ID ? require("../../Assets/images/awf-logo.gif") : require("../../Assets/images/EncoreSheetMetalLogo.png")} alt="logo" />
          </MyDiv>
          {department === "Flashing" || !department ? (
            <MyDiv className="barcodeBars">
              <Barcode value={item.order_unique_id} font="monospace" fontSize={14} width={item.account_UID === AWF_CUST_ID ? 9.5 : 6.5} height={230} />
            </MyDiv>
           ) : null}
        </MyDiv>
        <MyDiv className="barcodeItems">
          <MyDiv className="BarcodeLeft" style={{ marginTop: (department === "Flashing" || !department) ? '0px' : '35px'}}>
            <MyDiv>
              <HeadingTwo>{item.order_unique_id}</HeadingTwo>
              <HeadingThree>{getShortenedDepartment()}</HeadingThree>
            </MyDiv>
            <HeadingFour>
              {item.order_delivery_address_mode === "0" ? item.order_store_delivery_city : ""}
              {item.order_delivery_address_mode === "1" ? item.order_site_delivery_city : ""}
              {item.order_delivery_address_mode === "2" ? "PickUp Order" : ""}
              {/* {item.order_delivery_address_mode === '1' ? item.order_site_delivery_city : item.order_store_delivery_city} */}
            </HeadingFour>
          </MyDiv>
          <MyDiv className="BarcodeRight">
            <ul>
              <li>
                <LabelTag>Po Number</LabelTag>
                <SpanTag>{item.order_customer_PO_number}</SpanTag>
              </li>
              <li>
                <LabelTag>Date</LabelTag>
                <SpanTag>{item.created_str.split(" ")[0]}</SpanTag>
              </li>
              <li>
                <LabelTag>Due Date</LabelTag>
                <SpanTag> {item.order_delivery_date_str}</SpanTag>
              </li>
              <li>
                <LabelTag>Pieces</LabelTag>
                <SpanTag> {getCount()}</SpanTag>
                <MyDiv className="barcodeQRsection">
                  {department === "Flashing" || !department ? (
                    <QRCode logoHeight={32} logoWidth={32} value={item.order_unique_id} size="250" logoImage={require("../../Assets/images/encore-fav.png")} />
                  ) : (
                    <QRCode logoHeight={32} logoWidth={32} value={item.order_unique_id + getShortenedDepartment()} size="250" logoImage={require("../../Assets/images/encore-fav.png")} />
                  )}
                </MyDiv>
              </li>
              <li>
                <LabelTag>Rack</LabelTag>
                <SpanTag>{item.order_master_rack}</SpanTag>
              </li>
              <li>
                <LabelTag>Time</LabelTag>
                <StrongTag> {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)} </StrongTag>
              </li>
            </ul>
          </MyDiv>
        </MyDiv>
      </div>
    </Col>
  );
};

export default BarcodeSection;
