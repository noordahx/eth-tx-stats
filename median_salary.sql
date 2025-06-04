CREATE TABLE Employees (
    EmployeeID INT PRIMARY KEY,
    Salary DECIMAL(10, 2)
);

INSERT INTO Employees (EmployeeID, Salary) VALUES (1001, 50000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1002, 52000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1003, 54000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1004, 56000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1005, 58000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1006, 60000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1007, 62000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1008, 64000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1009, 66000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1010, 68000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1011, 70000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1012, 72000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1013, 74000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1014, 76000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1015, 78000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1016, 80000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1017, 82000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1018, 84000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1019, 86000.00);
INSERT INTO Employees (EmployeeID, Salary) VALUES (1020, 88000.00);


WITH RankSalaries AS (
    SELECT 
        Salary,
        ROW_NUMBER() OVER (ORDER BY Salary) AS rn, -- rank of each salary
        COUNT(*) OVER () AS total
    FROM Employees
)
SELECT AVG(Salary) AS MedianSalary
FROM RankSalaries
WHERE rn IN (
    (total + 1) / 2,
    (total + 2) / 2
);
-- m = 2n      => median_ids = (2n+1) // 2 & (2n+2) // 2 = n, n+1
-- m = 2n - 1   => median_ids = (2n) // 2 && (2n+1) // 2 = n, n