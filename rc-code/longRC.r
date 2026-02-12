print("Welcome to the script.")
time <- 3600
print(paste0("Waiting ", time / 60, " minutes ..."))
Sys.sleep(time)
print(paste0(time / 60, " minutes have passed. Script over."))
