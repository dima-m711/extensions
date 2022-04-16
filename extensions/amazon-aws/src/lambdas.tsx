import {
  getPreferenceValues,
  ActionPanel,
  CopyToClipboardAction,
  List,
  OpenInBrowserAction,
  Detail,
  LocalStorage,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import AWS from "aws-sdk";
import setupAws from "./util/setupAws";
import { FunctionConfiguration, FunctionList, String } from "aws-sdk/clients/lambda";
import { Preferences } from "./types";

setupAws();
const lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
const preferences: Preferences = getPreferenceValues();

function useFetchData<P, F extends (...args: any[]) => Promise<P>>(asyncFunction:F){
  const [loaded, setLoaded] = useState(false);
  const [data,setData] = useState<P>();
  const [hasError, setHasError] = useState(false);

  const fetch = useCallback(async (...args)=>{
    try{
      setHasError(false);
      setLoaded(false);
      const result = await asyncFunction(...args);
      setData(result);
      setLoaded(true);
    }
    catch(e){
      console.error(e)
      setHasError(true);
    }

  },[asyncFunction]);
  return {loaded, hasError, data, fetch};
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
  return JSON.parse(functionsStr);
}

export default function ListLambdas() {
  const awsResult = useFetchData<FunctionList, ()=>Promise<FunctionList>>(loadLambdas);
  const cachedResult = useFetchData<FunctionList, ()=>Promise<FunctionList>>(loadFromCache);

  useEffect(() => {
    console.debug('start loading');
    awsResult.fetch();
    cachedResult.fetch();
  },[]);
  useEffect(()=>{
    console.debug('try to store');
    if (!awsResult.hasError && awsResult.loaded && awsResult.data?.length){
      console.debug('store cache');
      LocalStorage.setItem(getCacheName(), JSON.stringify(awsResult.data));
    }
  },[awsResult.hasError, awsResult.loaded, awsResult.data])
  if (awsResult.hasError) {
    return (
      <Detail markdown="No valid [configuration and credential file] (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) found in your machine." />
    );
  }
  const isLoaded = awsResult.loaded || (cachedResult.loaded && cachedResult.data?.length)
  return (
    <List isLoading={!isLoaded } searchBarPlaceholder="Filter lambda by name...">
      {(awsResult.data || cachedResult.data)?.map((lambda) => {
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
