import httpx
import random
import sys
import asyncio

API_URL = "http://localhost:7860"
FACULTY_EMAIL = "nishanthan.r2022a@vitstudent.ac.in" # Update this to your faculty email if different
FACULTY_PASSWORD = "password123" # Update if different

async def main():
    if len(sys.argv) < 3:
        print("Usage: python simulate_students.py <SUBJECT_ID> <QUIZ_ID>")
        sys.exit(1)
        
    subject_id = int(sys.argv[1])
    quiz_id = int(sys.argv[2])

    print("--- Simulating 5 Students ---")
    
    async with httpx.AsyncClient() as client:
        # 1. Login as Faculty to enroll students
        print("\n1. Logging in as Faculty...")
        resp = await client.post(f"{API_URL}/auth/login", data={"username": FACULTY_EMAIL, "password": FACULTY_PASSWORD})
        if resp.status_code != 200:
            print("Failed to login as faculty! Please update the credentials in the script.")
            return
            
        faculty_token = resp.json()["access_token"]
        faculty_headers = {"Authorization": f"Bearer {faculty_token}"}
        
        students = [
            {"name": "Alice Smith", "email": "alice@student.com"},
            {"name": "Bob Jones", "email": "bob@student.com"},
            {"name": "Charlie Brown", "email": "charlie@student.com"},
            {"name": "Diana Prince", "email": "diana@student.com"},
            {"name": "Evan Wright", "email": "evan@student.com"},
        ]
        
        # 2. Enroll Students
        print(f"\n2. Enrolling 5 students in Subject {subject_id}...")
        for s in students:
            resp = await client.post(f"{API_URL}/management/subjects/{subject_id}/enroll", json=s, headers=faculty_headers)
            print(f"   Enrolled {s['name']}: {resp.status_code}")
            
        # 3. Each student logs in and takes the quiz
        print(f"\n3. Students taking Quiz {quiz_id}...")
        for s in students:
            # Login
            resp = await client.post(f"{API_URL}/auth/login", data={"username": s["email"], "password": "student123"})
            student_token = resp.json()["access_token"]
            student_headers = {"Authorization": f"Bearer {student_token}"}
            
            # Fetch Quiz
            quiz_resp = await client.get(f"{API_URL}/student/quizzes/{quiz_id}", headers=student_headers)
            if quiz_resp.status_code != 200:
                print(f"   {s['name']} failed to fetch quiz (is it published?): {quiz_resp.status_code}")
                continue
                
            quiz_data = quiz_resp.json()
            
            # Generate random answers
            answers = []
            for q in quiz_data["questions"]:
                # Pick a random option
                random_option = random.choice(q["options"])
                answers.append({
                    "question_id": q["id"],
                    "selected_option_id": random_option["id"]
                })
                
            # Submit Quiz
            submit_resp = await client.post(
                f"{API_URL}/student/quizzes/{quiz_id}/submit", 
                json={"answers": answers}, 
                headers=student_headers
            )
            
            if submit_resp.status_code == 200:
                score = submit_resp.json()["score"]
                print(f"   {s['name']} submitted successfully! Score: {score}")
            else:
                print(f"   {s['name']} failed to submit: {submit_resp.text}")

        print("\n--- Done! ---")
        print("You can now open the React UI, log in as faculty, and check the Quiz Results dashboard!")

if __name__ == "__main__":
    asyncio.run(main())
