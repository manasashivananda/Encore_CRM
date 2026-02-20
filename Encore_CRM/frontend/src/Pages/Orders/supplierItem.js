import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDispatch } from "react-redux";
import { Col, Row, Modal, Button } from "react-bootstrap";
import axios from "axios";
import swal from "sweetalert2";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { HeadingFour, HeadingSix, MyDiv, Avatar, HeadingThree } from "../Common/Components";
import moment from "moment";
import { Tooltip, IconButton } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import { setSupplierCount } from "../../store/supplierSlice";
import socket from "../../socket";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const UserId = localStorage.getItem("userId");

const SupplierTabData = ({ OrderInfo, orderUpdates }) => {
  const [btnLoading, setBtnLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [supplierContent, setSupplierContent] = useState([]);
  const [queryType, setQueryType] = useState("");
  const [supplierInfoId, setSupplierInfoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const quillRef = useRef(null);
  const quillInstance = useRef(null);
  const bottomRef = useRef(null);
  const dispatch = useDispatch();

  const loadSupplierItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}fetch-supplier-data/${OrderInfo._id}`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      setSupplierContent(res.data.supplier_details);

      if (res.data?.supplier_count != null) {
        dispatch(setSupplierCount(res.data.supplier_count));
      }
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Error loading supplier data",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [OrderInfo._id, orderUpdates]);

  useEffect(() => {
    loadSupplierItems();

    socket.on("new_supplier_added", data => {
      if (data.orderId === OrderInfo._id) {
        loadSupplierItems();
        if (data.supplierCount != null) {
          dispatch(setSupplierCount(data.supplierCount));
        }
      }
    });

    socket.on("supplier_updated", data => {
      if (data.orderId === OrderInfo._id) {
        loadSupplierItems();
      }
    });

    return () => {
      socket.off("new_supplier_added");
      socket.off("supplier_updated");
    };
  }, [OrderInfo._id, dispatch, loadSupplierItems]);

  const initializeQuill = () => {
    if (quillRef.current) {
      if (quillInstance.current) quillInstance.current = null;
      quillInstance.current = new Quill(quillRef.current, {
        theme: "snow",
        placeholder: "Write your supplier here...",
      });
    }
  };

  const handleShow = async type => {
    setQueryType(type);
    setSupplierInfoId(null);

    setShowModal(true);
    setTimeout(() => {
      initializeQuill();
      if (quillInstance.current) {
        quillInstance.current.focus();
      }
    }, 300);
  };

  const cleanMalformedSignedUrls = htmlContent => {
    return htmlContent.replace(/https:\/\/[^"]+\/(https:\/\/[^"]+)/g, (match, inner) => inner);
  };

  const handleEdit = async item => {
    setQueryType(item.sply_Added_Status);
    setSupplierInfoId(item._id);
    let updatedContent = cleanMalformedSignedUrls(item.sply_Added_Content);
    const imgSrcMatches = [...updatedContent.matchAll(/<img[^>]+src="([^"]+)"/g)];
    const srcUrls = imgSrcMatches.map(match => match[1]);
    const imageKeys = srcUrls
      .map(src => {
        try {
          const decoded = decodeURIComponent(src);
          const split = decoded.split(".amazonaws.com/")[1];
          return split?.split("?")[0];
        } catch {
          return "";
        }
      })
      .filter(k => k && /\.(jpe?g|png|gif|bmp|webp)$/i.test(k));

    if (imageKeys.length > 0) {
      try {
        const res = await axios.post(
          `${API_BASE_URL}generate-signed-urls`,
          { imageKeys },
          {
            headers: {
              "x-access-token": localStorage.getItem("token"),
              "Content-Type": "application/json",
            },
          }
        );
        const signedUrls = res.data.imageUrls;
        srcUrls.forEach((oldSrc, index) => {
          const freshUrl = signedUrls[index];
          updatedContent = updatedContent.replaceAll(oldSrc, freshUrl);
        });
      } catch (err) {}
    }

    setShowModal(true);
    setTimeout(() => {
      initializeQuill();
      if (quillInstance.current) {
        quillInstance.current.root.innerHTML = updatedContent;
        quillInstance.current.focus();
      }
    }, 300);
  };

  const handleClose = () => {
    setShowModal(false);
    if (quillInstance.current) {
      quillInstance.current.root.innerHTML = "";
    }
  };

  const submit = async e => {
    e.preventDefault();
    setBtnLoading(true);

    if (!quillInstance.current) {
      swal.fire({ text: "Editor is not initialized yet!", icon: "error" });
      setBtnLoading(false);
      return;
    }

    let editorContent = quillInstance.current.root.innerHTML;
    const tempElement = document.createElement("div");
    tempElement.innerHTML = editorContent;
    const textContent = tempElement.textContent || tempElement.innerText || "";

    const hasText = textContent.trim().length > 0;
    const hasImage = editorContent.includes("<img");

    if (!hasText && !hasImage) {
      swal.fire({ text: "Please enter text or upload an image", icon: "warning" });
      setBtnLoading(false);
      return;
    }

    const formData = new FormData();
    const parser = new DOMParser();
    const doc = parser.parseFromString(editorContent, "text/html");
    const imgTags = doc.querySelectorAll("img");

    let imagePlaceholderMap = new Map();
    let imageFiles = [];

    imgTags.forEach((img, index) => {
      const imageUrl = img.src;
      if (imageUrl.startsWith("data:image")) {
        const placeholder = `{{image_${index}}}`;
        imagePlaceholderMap.set(placeholder, imageUrl);
        imageFiles.push({ placeholder, filePromise: fetch(imageUrl).then(res => res.blob()) });
      }
    });

    try {
      let uploadedImageKeys = [];

      if (imageFiles.length > 0) {
        const blobs = await Promise.all(imageFiles.map(img => img.filePromise));
        blobs.forEach((blob, index) => {
          formData.append("images", blob, `image${index}.png`);
        });

        const imageUploadResponse = await axios.post(`${API_BASE_URL}upload-supplier-images`, formData, {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "multipart/form-data",
          },
        });

        uploadedImageKeys = imageUploadResponse.data.imageKeys;

        [...imagePlaceholderMap.keys()].forEach((placeholder, index) => {
          const base64Img = imagePlaceholderMap.get(placeholder);
          editorContent = editorContent.replace(base64Img, uploadedImageKeys[index]);
        });
      }

      const allImageKeys = [...editorContent.matchAll(/<img[^>]+src="([^"]+)"/g)]
        .map(m => {
          try {
            const decoded = decodeURIComponent(m[1]);
            const key = decoded.split(".amazonaws.com/")[1]?.split("?")[0] || decoded;
            return key;
          } catch {
            return "";
          }
        })
        .filter(k => k && /\.(jpe?g|png|gif|bmp|webp)$/i.test(k));

      const saveResponse = await axios({
        method: supplierInfoId ? "patch" : "post",
        url: supplierInfoId ? `${API_BASE_URL}update-supplier-data/${supplierInfoId}` : `${API_BASE_URL}add-new-supplier-data/${OrderInfo._id}`,
        data: {
          supplierContent: editorContent,
          imageKeys: allImageKeys,
          queryType: queryType,
        },
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (saveResponse.status === 200) {
        swal.fire({ text: "Successfully Saved", icon: "success" });
        loadSupplierItems();
        handleClose();
        requestAnimationFrame(() => {
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }, 500);
        });

        if (saveResponse.data?.supplierCount != null) {
          dispatch(setSupplierCount(saveResponse.data.supplierCount));
        }
      }
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error occurred", icon: "error" });
    } finally {
      setBtnLoading(false);
      orderUpdates();
    }
  };

  const getQueryTypeLabel = type => {
    switch (type) {
      case "1":
        return "Unattended";
      case "2":
        return "Ordered";
      default:
        return "";
    }
  };

  return (
    <>
      <Modal show={showModal} onHide={handleClose} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {supplierInfoId ? "Edit" : "Add"} {getQueryTypeLabel(queryType)}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ height: 400 }}>
          <div className="w-100" style={{ height: 300 }}>
            <div ref={quillRef} />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button className="secondary-btn" onClick={handleClose}>
            Cancel
          </Button>
          <Button className="primary-btn" onClick={submit} disabled={btnLoading}>
            {btnLoading ? "Saving..." : "Submit"}
          </Button>
        </Modal.Footer>
      </Modal>

      <Row className="chatSection">
        <Col md={12} className="mt-3">
          {supplierContent?.length ? (
            supplierContent.map((item, index) => (
              <Row key={item._id} className={`chatItem ${UserId !== item.sply_Added_User ? "" : "odd-user-added-row"}`} ref={index === supplierContent.length - 1 ? bottomRef : null}>
                <Col md={8} className="chatContainer d-flex">
                  <MyDiv className="tableAvatar pt-4">
                    <Avatar round="50px" size="40" name={item.user_Name} src="" />
                  </MyDiv>
                  <MyDiv className="w-100">
                    <MyDiv className="chatContainerTitle d-flex justify-content-between align-item-center">
                      <MyDiv className="d-flex">
                        <HeadingFour>
                          {item.user_Name}
                          {item.sply_Added_Status === "1" ? " - Unattended" : " - Ordered"}
                        </HeadingFour>
                        <HeadingSix>{moment(item.created).format("DD-MMM-YYYY hh:mm a")}</HeadingSix>
                      </MyDiv>
                      <MyDiv className="mt-n1">
                        {index === supplierContent.length - 1 && item.sply_Added_Status !== "2" && item.sply_Added_User === UserId && (
                          <Tooltip title="Edit">
                            <IconButton color="success" onClick={() => handleEdit(item)}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </MyDiv>
                    </MyDiv>
                    <MyDiv className={`chatContent ${item.sply_Added_Status === "1" ? "queryRow" : item.sply_Added_Status === "2" ? "replyRow" : ""}`}>
                      <div dangerouslySetInnerHTML={{ __html: item.sply_Added_Content }} />
                    </MyDiv>
                  </MyDiv>
                </Col>
              </Row>
            ))
          ) : (
            <HeadingThree className="text-center m-3">No Supplier Item(s) Found</HeadingThree>
          )}
        </Col>
      </Row>

      <Row>
        <Col md={12} className="mt-3 text-center">
          <button className="btn primary-btn mx-1" onClick={() => handleShow("1")}>
            Add Query
          </button>
          <button className="btn success-btn mx-1" onClick={() => handleShow("2")}>
            Ordered
          </button>
        </Col>
      </Row>
    </>
  );
};

export default SupplierTabData;
