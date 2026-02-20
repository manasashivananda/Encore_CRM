import { useState } from 'react';
import axios from 'axios';
import { MyDiv, SpanTag, StrongTag } from '../../Common/Components';
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const ExternalOrdersBulkUpload = ({ handleResponse }) => {

  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = event.target.result;
      setFileData(fileData);
    };
    if (file) {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fileData) {
      swal.fire({
        text: 'Please select a file',
        icon: 'error',
        type: 'error',
      });
      return;
    }
    setLoading(true);

    const url = `${API_BASE_URL}bulk-import-ext-orders`;
    const method = 'post';
    const formData = new FormData();
    formData.append('documents', new Blob([fileData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'filename.xlsx');

    try {
      const response = await axios({
        method, url, data: formData, headers: { "x-access-token": localStorage.getItem("token"), 'Content-Type': 'multipart/form-data', },
      });

      if (response.status === 200) {
        setLoading(false);
        const errorMessage = response?.data?.errorMessages?.map((item) => item.message) || ""
        swal.fire({
          titleText: response?.data?.message + (response?.data?.skippedOrders?.length ? ` Format required is ${response?.data?.sampleFormat?.Delivery_Date}, ${response?.data?.sampleFormat?.Delivery_Time}` : ""),
          text: response?.data?.skippedOrders?.toString(),
          icon: 'success',
          type: 'success',
        }).then(() => {
          handleResponse();
        });
        setFileData(null);
        // handleResponse();
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          fileInput.value = '';
        }
      }
    } catch (error) {
      setLoading(false);
      swal.fire({
        text: error.response.message,
        icon: 'error',
        type: 'error',
      });
    }
  };


  return (
    <MyDiv className="float-end">
      {loading ? <>
        <MyDiv className="BulkUploadLoader"><SpanTag><MyDiv className="lds-ring"><MyDiv></MyDiv><MyDiv></MyDiv><MyDiv></MyDiv><MyDiv></MyDiv></MyDiv><br />Orders Uploading! <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete</SpanTag> </MyDiv></> : null}
      <MyDiv className='d-flex justify-content-end align-items-center'>
        <MyDiv md={5} className='pe-0'>
          <StrongTag className="me-2 float-start">Orders Bulk Upload :</StrongTag>
          <MyDiv className="w-100 d-flex align-items-center justify-content-between">
            <input type="file" className="float-start mt-1 w-50" accept=".xls,.xlsx" onChange={handleFileUpload} />
            <button className="btn primary-btn add-cta search mx-1" onClick={handleSubmit}>Upload File</button>
          </MyDiv>
        </MyDiv>

      </MyDiv>

    </MyDiv>
  );
};

export default ExternalOrdersBulkUpload;

