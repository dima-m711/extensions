import {
  getPreferenceValues,
  ActionPanel,
  CopyToClipboardAction,
  List,
  OpenInBrowserAction,
  Detail,
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

export default function ListLambdas() {
  const {loaded, hasError, data: lambdas, fetch} = useFetchData<FunctionList, ()=>Promise<FunctionList>>(loadLambdas);
  useEffect(() => {
    console.debug('start loading')
    fetch();
  },[]);

  if (hasError) {
    return (
      <Detail markdown="No valid [configuration and credential file] (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) found in your machine." />
    );
  }
  console.log('totla loaded', lambdas?.length)
  return (
    <List isLoading={!loaded} searchBarPlaceholder="Filter lambda by name...">
      {lambdas?.map((lambda) => {
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
