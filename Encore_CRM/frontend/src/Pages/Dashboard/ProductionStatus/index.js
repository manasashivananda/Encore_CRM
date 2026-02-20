import { Card, CardContent, MenuItem, TextField, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { CardHeader, Col, Row } from "react-bootstrap";
import { HeadingTwo } from "../../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import { IoMdArrowBack } from "react-icons/io";
import Carousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';
import NoDataFound from "../../Common/noDataFound";
import { speakText } from "./textToSpeech";
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function ProductionStatusDashboard() {
    const navigate = useNavigate();
    const [filter, setFilter] = useState({
        machine_name : "All"
    })

    const [InProgressData, setInProgressData] = useState([]);
    const [CompletedData, setCompletedData] = useState([]);
    const [machinesList, setMachinesList] = useState([]);
    

    useEffect(() => {
        const eventSource = new EventSource(`${API_BASE_URL}events`);

        eventSource.onmessage = (e) => {
            const payload = JSON.parse(e.data);

            const liveInProgress = payload.inProgress;
            const liveCompleted = payload.completed;

            // Apply filter
            const filteredInProgress =
                filter.machine_name === "All"
                    ? liveInProgress
                    : liveInProgress.filter(item => item.machine_name === filter.machine_name);
            
            const filteredCompleted =
                filter.machine_name === "All"
                    ? liveCompleted
                    : liveCompleted.filter(item => item.machine_name === filter.machine_name);

            setInProgressData(filteredInProgress);
            setCompletedData(filteredCompleted);
        };

        eventSource.onerror = () => {
            console.error("SSE connection error");
            eventSource.close();
        };

        return () => eventSource.close();
    }, [filter.machine_name]);

    useEffect(() => {
        window.speechSynthesis.onvoiceschanged = () => {
            // triggers loading of voices
            console.log("Voices loaded:", window.speechSynthesis.getVoices());
        };
    }, []);


    const [shakeId, setShakeId] = useState(null);
    const [remakeShakeCount, setRemakeShakeCount] = useState(0);

    useEffect(() => {
        const activeRemakeJob = InProgressData.find(
            item => item.remake === true
        );

        if (activeRemakeJob && remakeShakeCount < 5) {
            speakText("Remake order detected");
            setShakeId(activeRemakeJob.id);
            setRemakeShakeCount(count => count + 1);
            setTimeout(() => setShakeId(null), 400);
        } else if (!activeRemakeJob) {
            setRemakeShakeCount(0); // Reset count when no remake job is active
        }
    }, [InProgressData]);

    useEffect(() =>{
        loadMachines()
    },[])

    const handleFilterChange = (e) => {
        const machine = e.target.value;
        setFilter(prev => ({ ...prev, machine_name: machine }));

        // If user selects "All" or clears selection, show all items
        if (!machine || machine === "All") {
            setInProgressData(InProgressData);
            setCompletedData(CompletedData);
            return;
        }

        // Otherwise filter by machine name
        setInProgressData(InProgressData.filter(item => item.machine_name === machine));
        setCompletedData(CompletedData.filter(item => item.machine_name === machine))
    };

    const loadMachines = async () => {
        const url = API_BASE_URL + `fetch-folding-machines-dropdown`;
        try {
          const res = await axios.get(url, { 
            headers: { 
              "x-access-token": localStorage.getItem("token"), 
              Accept: "application/json", 
              "Content-Type": "application/json" 
            } 
          });
          setMachinesList(res.data.Machines);
        } catch (error) {
          console.error("Failed to fetch machines:", error);
        }
      };

    return(
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={8}>
                <HeadingTwo>
                    <Link className="arrow-btn" onClick={() => navigate(-1)}>
                    <IoMdArrowBack />
                    </Link>
                    Production Status Dashboard
                </HeadingTwo>
                </Col>
                <Col md={4}>
                    <TextField
                        select
                        fullWidth
                        label="Machine Name"
                        value={filter.machine_name}
                        onChange={(e) => handleFilterChange(e)}
                    >
                        <MenuItem value={"All"}>All</MenuItem>
                        {machinesList?.map((item, index) => {
                            return <MenuItem key={index} value={item}>{item}</MenuItem>
                        })}
                    </TextField>
                </Col>
            </Row>

            <Row className="GeneralHeading mt-2" style={{ 
                backgroundColor: 'orange'
            }}>
                <Typography variant="h4" sx={{fontWeight:'bold'}}>IN PROGRESS JOBS</Typography>
            </Row>
            <Row
                className="GeneralHeading mt-2"
                style={{
                    width: "100%",
                    position: "relative",
                    display: "flex",
                    justifyContent: "center",
                }}
            >
                {!InProgressData.length && <NoDataFound text="No Jobs" />}

                {/* 🔥 Responsive Grid for Non-Active Jobs */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
                        gap: "20px",
                        width: "100%",
                        padding: "10px",
                        maxWidth: "96vw",
                        alignItems: "center",
                    }}
                >
                    {InProgressData?.map(item => (
                        <Card
                            key={item.id}
                            className={shakeId === item.id ? "shake" : ""}
                            sx={{
                                textAlign: "center",
                                padding: "15px",
                                backgroundColor:
                                    shakeId === item.id
                                        ? "red"
                                        : item.active
                                        ? "blue"
                                        : "#fff",
                                color: item.active ? "white" : "#000",
                                borderRadius: "12px",
                                boxShadow: "0px 0px 8px rgba(0,0,0,0.1)",
                                transform: item.active ? "scale(1.05)" : "scale(1)",
                                transition: "0.25s ease",
                                zIndex: item.active ? 5000 : "auto",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                minHeight: 160,
                                overflow: "hidden",
                                width: "100%",
                            }}
                        >
                            <CardHeader sx={{ padding: 0, width: "100%" }}>
                                <Typography
                                    variant="h1"
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "clamp(1.5rem, 4vw, 3rem)",
                                        lineHeight: 1.2,
                                        color: item.active ? "white" : "inherit",
                                        wordBreak: "break-word",
                                        overflowWrap: "break-word",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        maxWidth: "100%",
                                        padding: "0 10px",
                                    }}
                                >
                                    {item.order_no}
                                </Typography>
                            </CardHeader>
                            <CardContent sx={{ padding: "10px 0 0 0", width: "100%" }}>
                                <Typography
                                    variant="h3"
                                    sx={{
                                        fontWeight: 600,
                                        fontSize: "clamp(1.2rem, 3vw, 2rem)",
                                        color: item.active ? "white" : "inherit"
                                    }}
                                >
                                    {item.done_pieces} / {item.total_pieces}
                                </Typography>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* 🔵 ACTIVE JOB — CENTERED ZOOM CARD */}
                {/* {InProgressData.filter(item => item.active).map(item => (
                    <div
                        key={item.id}
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-15%, -50%) scale(1.8)",
                            zIndex: 5000,
                            transition: "all 0.4s ease-in-out",
                            pointerEvents: "none",
                        }}
                    >
                        <Col md={4}>
                        <Card
                            sx={{
                                textAlign: "center",
                                backgroundColor: "blue",
                                color: "white",
                                padding: "20px",
                                borderRadius: "14px",
                                // minWidth: "380px",
                                // maxWidth: "480px",
                                boxShadow: "0px 0px 30px rgba(0,0,0,0.4)",
                            }}
                        >
                            <CardHeader>
                                <Typography variant="h1">{item.order_no}</Typography>
                            </CardHeader>
                            <CardContent>
                                <Typography variant="h3">
                                    {item.done_pieces} / {item.total_pieces}
                                </Typography>
                            </CardContent>
                        </Card>
                        </Col>
                    </div>
                ))} */}
            </Row>


            {/* Completed bar carousel showing 4 cards at once */}

            <Row className="GeneralHeading mt-2" style={{ 
                backgroundColor: 'lightgreen'
             }}>
                <Typography variant="h4" sx={{fontWeight:'bold'}}>COMPLETED JOBS</Typography>
            </Row>
            <Row className="GeneralHeading mt-2 row-gap-1">
                {/* IN PROGRESS BOX */}
                <Col xs={12} md={12}>
                    {/* Carousel using React Multi Carousel */}
                    <Carousel
                        additionalTransfrom={0}
                        arrows
                        autoPlay={true}
                        centerMode={false}
                        containerClass="container-with-dots"
                        draggable
                        infinite={false}
                        keyBoardControl
                        minimumTouchDrag={80}
                        renderButtonGroupOutside={false}
                        autoPlaySpeed={1}
                        responsive={{
                        desktop: { breakpoint: { max: 3000, min: 1024 }, items: 4 },
                        tablet: { breakpoint: { max: 1024, min: 464 }, items: 2 },
                        mobile: { breakpoint: { max: 464, min: 0 }, items: 1 }
                        }}
                        itemClass="px-2"
                    >
                        {CompletedData.map(card => (
                        <Card key={card.id} className="text-center h-full shadow-md p-3 border rounded-xl">
                            <Typography variant="h4">{card.order_no}</Typography>
                            <Typography variant="subtitle1" className="font-semibold">
                            {card.done_pieces} / {card.total_pieces}
                            </Typography>
                            <Typography variant="body2" className="mt-1">Start: {card.start_timestamp}</Typography>
                            <Typography variant="body2">End: {card.end_timestamp}</Typography>
                        </Card>
                        ))}
                    </Carousel>
                </Col>
            </Row>

        
            
        </React.Fragment>
    )
}

export default ProductionStatusDashboard