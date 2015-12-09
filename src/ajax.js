const ajax = (method,target) => {
    return new Promise((Y,N) => {
        let req = new XMLHttpRequest();

        req.open(method, target, true);

        req.onreadystatechange = () => {
            if(req.readyState == 4) { 
                if(req.status >= 200 && req.status < 400) { 
                    try {
                        let res = JSON.parse(req.response);
                        Y(res);
                    } catch(err) {
                        N(err);
                    }
                }
                else {
                    N(new Error(`${req.url} failed: ${req.status} ${req.statusText}`));
                }
            }
        };

        req.send();
    });
};
