import { managementAppGetReadyStudiesRequest, toaGetJobsRequest, toaUpdateJobStatus } from "./api";
import { ManagementAppGetReadyStudiesResponse, ManagementAppJob, TOAGetJobsResponse } from "./types";

export interface IEnclave<T> {
    runStudies(): Promise<void>;

    getAllStudiesInEnclave():Promise< Array<T>>;

    getRunningStudies(): Promise<Array<T>>;

    filterJobsInEnclave(
        bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        toaGetJobsResult: TOAGetJobsResponse,
    runningJobsInEnclave: Array<T>):  ManagementAppGetReadyStudiesResponse;

    launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void>;
    
}

export class Enclave<T> implements IEnclave<T> {
    async runStudies(): Promise<void> {
        const bmaReadysResults = await managementAppGetReadyStudiesRequest()
        console.log(
            `Found ${bmaReadysResults.jobs.length} jobs in management app. Job ids: ${bmaReadysResults.jobs.map((job) => job.jobId)}`,
        )
        bmaReadysResults.jobs.forEach((job)=>{
            console.log(job)
        })

        const toaGetJobsResult = await toaGetJobsRequest()
        console.log(
            `Found ${toaGetJobsResult.jobs.length} jobs with results in TOA. Job ids: ${toaGetJobsResult.jobs.map((job) => job.jobId)}`,
        )

        const jobsInEnclave: Array<T> = await this.getRunningStudies()
        const filteredResult: ManagementAppGetReadyStudiesResponse = this.filterJobsInEnclave(
            bmaReadysResults,
            toaGetJobsResult,
            jobsInEnclave,
        )

        console.log(
            `Found ${filteredResult.jobs.length} studies that can be job. Job ids: ${filteredResult.jobs.map((job) => job.jobId)}`,
        )

        for (const job of filteredResult.jobs) {
            console.log(`Launching study for job ID ${job.jobId}`)

            const toaEndpointWithJobId = `${process.env.TOA_BASE_URL}/api/job/${job.jobId}`

            await this.launchStudy(job, toaEndpointWithJobId)

            await toaUpdateJobStatus(job.jobId, { status: 'JOB-PROVISIONING' })
        }
        this.cleanup()
    }

    filterJobsInEnclave(
        _bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        _toaGetJobsResult: TOAGetJobsResponse,
        _runningJobsInEnclave: T[],
    ): ManagementAppGetReadyStudiesResponse {
        throw new Error('Method not implemented.')
    }
    getAllStudiesInEnclave(): Promise<T[]> {
        throw new Error('Method not implemented.')
    }
    getRunningStudies(): Promise<T[]> {
        throw new Error('Method not implemented.')
    }
    async launchStudy(_job: ManagementAppJob, _toaEndpointWithJobId: string): Promise<void> {
        throw new Error('Method not implemented.')
    }

    async cleanup(): Promise<void>{
        throw new Error('Method not implemented.')
    }
    async checkForErroredJobs(): Promise<void> {
        throw new Error('Method not implemented.')
    }
}
