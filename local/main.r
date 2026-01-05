library(httr)  # For sending files to an API
library(readr) # For writing CSV files
library(jsonlite)

# Set Trusted Output App API Endpoint
trusted_output_endpoint <- Sys.getenv("TRUSTED_OUTPUT_ENDPOINT")

# Write the query results to a CSV file
csv_file_path <- "query_result.csv"
write_csv(data.frame(result = 42), csv_file_path)

response <- PUT(
  url = trusted_output_endpoint,
  body = toJSON(list(status = "JOB-RUNNING"), auto_unbox = TRUE),
  encode = "json",
  content_type_json()
)
response_content <- content(response, as = "parsed", type = "application/json")
print(response_content)


# Send aggregate results to Trusted Output App
# Make the POST request with basic authentication
response <- POST(
  url = paste0(trusted_output_endpoint, "/upload"),
  body = list(file = upload_file(csv_file_path)),  # Attach the CSV file
  encode = "multipart"  # Multipart form data encoding
)

# DEBUG: Print the response content
response_content <- content(response, as = "parsed", type = "application/json")
print(response_content)

# Check the API response
if (response$status_code == 200) {
  print("File uploaded successfully.")
} else {
  print(paste("File upload failed. Status code:", response$status_code))
}
