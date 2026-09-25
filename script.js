// Thuật toán Cầu Pascal
function tinhCauPascal(gdb, g1) {
    let str = gdb.toString() + g1.toString();
    while (str.length > 2) {
        let nextRow = "";
        for (let i = 0; i < str.length - 1; i++) {
            nextRow += ((parseInt(str[i]) + parseInt(str[i+1])) % 10).toString();
        }
        str = nextRow; 
    }
    return str;
}

// Thuật toán Bóng Dương và Bóng Âm
function tinhBong(haiSoCuoi, loai) {
    const quyLuatDuong = {'0':'5', '1':'6', '2':'7', '3':'8', '4':'9', '5':'0', '6':'1', '7':'2', '8':'3', '9':'4'};
    const quyLuatAm = {'0':'7', '1':'4', '2':'9', '3':'6', '5':'8', '4':'1', '6':'3', '7':'0', '8':'5', '9':'2'};
    
    let quyLuat = loai === 'duong' ? quyLuatDuong : quyLuatAm;
    let ketQua = "";
    
    for(let i = 0; i < haiSoCuoi.length; i++) {
        ketQua += quyLuat[haiSoCuoi[i]] || haiSoCuoi[i];
    }
    return ketQua;
}

// Thuật toán Cầu Kẹp
function timCauKep(chuoiGiai) {
    let ketQua = [];
    if (chuoiGiai.length >= 4) {
        for (let i = 0; i < chuoiGiai.length - 3; i++) {
            if (chuoiGiai[i] === chuoiGiai[i+3]) {
                ketQua.push(chuoiGiai.substring(i+1, i+3));
            }
        }
    }
    return ketQua.length > 0 ? ketQua.join(", ") : "Không có";
}

// Kích hoạt khi bấm nút phân tích
function xuLySoiCau() {
    const gdb = document.getElementById("gdb").value.trim();
    const g1 = document.getElementById("g1").value.trim();
    const giaiKhac = document.getElementById("giaiKhac").value.trim();
    
    if(gdb.length >= 5 && g1.length >= 4) {
        // Trả kết quả Pascal
        document.getElementById("kqPascal").innerText = tinhCauPascal(gdb, g1);
        
        // Trả kết quả Bóng (2 số cuối GĐB)
        let haiSoCuoi = gdb.slice(-2);
        document.getElementById("kqBongDuong").innerText = tinhBong(haiSoCuoi, 'duong');
        document.getElementById("kqBongAm").innerText = tinhBong(haiSoCuoi, 'am');
    } else {
        alert("Vui lòng nhập đầy đủ và chính xác GĐB và G1!");
    }

    if(giaiKhac) {
        document.getElementById("kqKep").innerText = timCauKep(giaiKhac);
    }
}

