import styles from "./client-ui-styles";

export default function Transcriber() {

    // useEffect(() => {
        
    // }, []);


    // const styles = {
    //     startButton: { backgroundColor: '#339136', color: 'white', border: 'none', display: 'inline-block',
    //     textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
    //     stopButton: { backgroundColor: '#a13a28', color: 'white', border: 'none', display: 'inline-block',
    //     textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
    //     clearButton: { backgroundColor: '#21807b', color: 'white', border: 'none', display: 'inline-block',
    //     textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
    //     error: { backgroundColor: '#ffd2d2', color: '#d8000c', borderRadius: '05px', display: 'none',
    //     verticalAlign: 'middle', fontSize: '1.5em', margin: '1.4rem auto', padding: 10 },
    //     textArea: { height: '25em', width: '60em', fontSize: 16, marginTop: 10 },
    //     icon: { paddingRight: '05px' }
    // }

    return(
        <div>
            <div id="error" className="isa_error" style={styles.error}>  </div>
            <textarea id="transcript" placeholder="Press Start and Speak into Your Mic" style={styles.textArea}
            rows="20" cols="30" readOnly="readonly"> 
            </textarea>
            <div className="row">
                <div className="col">
                    <button id="start-button" className="button-xl" disabled={ false } style={styles.startButton}>
                        <i className="fa fa-microphone" style={styles.icon}></i> Start
                    </button>
                    <button id="stop-button" className="button-xl" disabled={ true } style={styles.stopButton}>
                        <i className="fa fa-stop-circle" style={styles.icon}></i> Stop
                    </button>
                    <button id="clear-button" className="button-xl button-secondary" style={styles.clearButton}> 
                        Clear Output
                    </button>
                </div>       
            </div>
        </div>
    );

}