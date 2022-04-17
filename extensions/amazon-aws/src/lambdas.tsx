import {getPreferenceValues, ActionPanel, CopyToClipboardAction, List, OpenInBrowserAction, Detail,clearLocalStorage} from "@raycast/api";
import { LocalStorage } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import AWS from "aws-sdk";
import setupAws from "./util/setupAws";
import { FunctionConfiguration, FunctionList, String } from "aws-sdk/clients/lambda";
import { Preferences } from "./types";
import { compileFunction } from "vm";

setupAws();
const lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
const preferences: Preferences = getPreferenceValues();

function useFetchData<P, F extends (...args: any[]) => Promise<P>>(asyncFunction:F){
  const [loaded, setLoaded] = useState(false);
  const [data,setData] = useState<P>();
  const [error, setError] = useState();

  const fetch = useCallback(async (...args)=>{
    try{
      setError(undefined);
      setLoaded(false);
      const result = await asyncFunction(...args);
      setData(result);
      setLoaded(true);
    }
    catch(e){
      console.error(e)
      setError(e);
    }

  },[asyncFunction]);
  return {loaded, error, data, fetch};
}


function useFetchLambdas() {
  const [allLoaded, setAllLoaded] =useState(false)
  const [functions ,setFunctions] = useState<FunctionList>();
  const [error, setError] = useState<Error>();

  const loadNext = async (NextMarker?:string) => {
    try{
      setAllLoaded(false);
      const {NextMarker: resultNextMarker,Functions} = await lambda.listFunctions({Marker:NextMarker}).promise();
      setFunctions((currentFunctions)=>{
        const newFunctions = [...(currentFunctions||[]),...(Functions||[])];
        console.debug('load next',newFunctions?.length, NextMarker)
        return newFunctions;
      });
      if (resultNextMarker){
        await loadNext(resultNextMarker)
      }
      else{
        setAllLoaded(true);
      }
    }
    catch(e:unknown){
      console.error(e);
      setError(e as Error);
    }
  }
  return {fetch: loadNext, partialLoaded : !!functions?.length, allLoaded,hasError:!!error, data:functions, error  }
}

async function loadLambdas(NextMarker?:string): Promise<FunctionList>{
  const {NextMarker: resultNextMarker,Functions} = await lambda.listFunctions({Marker:NextMarker}).promise();
  console.log('loaded functions', Functions?.length, "first",Functions?.[0]?.FunctionName)
  const nextFunctions = resultNextMarker ? await loadLambdas(resultNextMarker) : [];
  return [...(Functions || []),...nextFunctions];
}


const getCacheName = () => `lambdas-${preferences.aws_profile}`

async function loadFromCache(): Promise<FunctionList>{
  const functionsStr = await LocalStorage.getItem<string>(getCacheName()) ;
  return JSON.parse(functionsStr || "[]");
}

export default function ListLambdas() {
  const awsResult = useFetchLambdas();
  const cachedResult = useFetchData<FunctionList, ()=>Promise<FunctionList>>(loadFromCache);
  useEffect(() => {
    console.debug('start loading');
    awsResult.fetch();
    cachedResult.fetch();
  },[]);
  const data = !awsResult.error &&  awsResult.data && cachedResult.data && awsResult.data?.length > cachedResult.data?.length ? awsResult.data : cachedResult.data;
  useEffect(()=>{
    console.debug('try to store');
    if (!awsResult.hasError && awsResult.data && ((cachedResult?.data?.length || 0) < awsResult.data?.length ) && awsResult.data?.length){
      console.debug('store cache');
      LocalStorage.setItem(getCacheName(), JSON.stringify(awsResult.data));
    }
  },[awsResult.hasError, awsResult.allLoaded, awsResult.data])
  if (awsResult?.error) {
    if ((awsResult.error.toString() ).includes("The security token included in the request is expired")){
      return (
        <Detail markdown="The security token included in the request is expired" />
      );
    }
    console.log(awsResult.error);
    return (
      <Detail markdown="No valid [configuration and credential file] (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) found in your machine." />
    );
  }
  console.log('awsResult.data',awsResult.data?.length);
  console.log('cachedResult.data',cachedResult.data?.length);

  const isLoaded = awsResult.partialLoaded || (cachedResult.loaded && cachedResult.data?.length)
  return (
    <List isLoading={!isLoaded } searchBarPlaceholder="Filter lambda by name...">
      {(data)?.map((lambda) => {
        return <LambdaListItem key={lambda.FunctionName} lambda={lambda} />;
      })}
    </List>
  );
}

function LambdaListItem(props: { lambda: FunctionConfiguration}) {
  const lambda = props.lambda;
  const lambdaId = lambda.FunctionName ?? "";
  const displayName = lambda.FunctionName ?? "";
  const path = `https://${preferences.region}.console.aws.amazon.com/lambda/home?region=${preferences.region}#/functions/${lambdaId}`
  return (
    <List.Item
      id={lambdaId}
      key={lambdaId}
      title={displayName}
      subtitle={lambda.Description}
      icon="lambda-icon.png"
      actions={
        <ActionPanel>
          <OpenInBrowserAction title="Open in Browser" shortcut={{ modifiers: [], key: "enter" }} url={path} />
          <CopyToClipboardAction title="Copy Path" content={lambdaId} />
        </ActionPanel>
      }
    />
  );
}
