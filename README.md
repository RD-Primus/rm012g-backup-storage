# Raspberry Pi File Loader

โปรเจกต์ Node.js สำหรับดาวน์โหลดไฟล์จาก Raspberry Pi ไปยังโฟลเดอร์ `data` เครื่อง Local ผ่าน SFTP

## การติดตั้ง

1. ติดตั้งไลบรารีที่จำเป็น (Ensure standard npm is installed):
   ```bash
   npm install
   ```

2. ตั้งค่ารหัสผ่าน:
   - ทำการคัดลอกไฟล์ `.env.example` เป็น `.env`
   - เปิดไฟล์ `.env` แล้วแก้ไข `SFTP_PASSWORD` ให้เป็นรหัสผ่านของเครื่อง Raspberry Pi

## การใช้งาน

รันคำสั่งด้านล่างเพื่อเริ่มการดาวน์โหลด:

```bash
npm start
```

โปรแกรมจะทำการเชื่อมต่อไปที่ `pi@10.222.1.3` และดาวน์โหลดไฟล์ทั้งหมดจาก `/media/pi/sdcaed/csv` (หรือ path ที่กำหนด) มาเก็บไว้ในโฟลเดอร์ `data` ในโปรเจกต์นี้
